(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DashboardPanelState = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function create(options) {
    options = options || {};
    var now = options.now || Date.now, scheduler = options.scheduler || {
      setInterval: function (fn, delay) { return setInterval(fn, delay); },
      clearInterval: function (handle) { clearInterval(handle); }
    };
    var listeners = {}, state = {}, timer = null, serial = 0;
    var ids = ['clock', 'focus', 'notes', 'calendar', 'calendar-agenda', 'calendar-today'];
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    function storage(id) { return options.storageForPanel(id); }
    function read(id, key, fallback) { try { var v = storage(id).get(key, fallback); return v == null ? fallback : v; } catch (_) { return fallback; } }
    function write(id, key, value) { var result = storage(id).set(key, copy(value)); if (result === false) throw new Error('Storage write failed'); }
    function emit(id) { (listeners[id] || []).slice().forEach(function (fn) { try { fn(get(id)); } catch (_) {} }); }
    function callback(name, data) { try { if (typeof options[name] === 'function') options[name](data); } catch (_) {} }
    function uid() { return String(now()) + '-' + (++serial) + '-' + Math.random().toString(36).slice(2); }
    function monthNow() { var d = new Date(now()); return {year:d.getFullYear(), month:d.getMonth()}; }
    function load() {
      var c = read('clock','settings',{}); if (!c || typeof c !== 'object') c = {};
      state.clock = Object.assign({}, c, {version:1, zones:Array.isArray(c.zones) && c.zones.length ? c.zones : [{id:'utc',timeZone:'UTC',label:'UTC'}], alarms:Array.isArray(c.alarms) ? c.alarms : [], activeAlarm:c.activeAlarm || null, occurrences:c.occurrences || {}, page:0, pageCount:1});
      var f = read('focus','state',{}); if (!f || typeof f !== 'object') f = {};
      var duration = f.duration === 25 || f.duration === 50 ? f.duration * 60000 : f.duration;
      if ([1500000,3000000].indexOf(duration) < 0) duration = 1500000;
      state.focus = Object.assign({}, f, {duration:duration, remaining:Number.isFinite(f.remaining) && f.remaining >= 0 ? f.remaining : duration, endAt:Number.isFinite(f.endAt) ? f.endAt : null, sessionId:f.sessionId || uid()});
      var txt = read('notes','text',''); state.notes = {text:typeof txt === 'string' ? txt : '',page:0,pageCount:1};
      var m = read('calendar','viewMonth',monthNow()); state.calendar = m && Number.isInteger(m.year) && Number.isInteger(m.month) && m.month >= 0 && m.month < 12 ? m : monthNow();
      state['calendar-agenda'] = {page:0,pageCount:1}; state['calendar-today'] = {page:0,pageCount:1};
    }
    function clockPersist(c) { var v = Object.assign({},c); delete v.page; delete v.pageCount; write('clock','settings',v); }
    function focusPersist(f) { write('focus','state',f); }
    function get(id) {
      if (!state[id]) return {available:false};
      var s = copy(state[id]);
      if (id === 'clock') { delete s.version; delete s.occurrences; s.alarmCapability = 'dashboard'; }
      if (id === 'focus') { s.remaining = s.endAt === null ? s.remaining : Math.max(0,s.endAt-now()); s.status = s.endAt !== null && s.remaining > 0 ? 'running' : s.remaining <= 0 ? 'complete' : s.remaining >= s.duration ? 'ready' : 'paused'; }
      return s;
    }
    function tick() {
      var f = state.focus;
      if (f.endAt !== null && f.endAt <= now()) {
        var next = Object.assign({}, f, {endAt:null, remaining:0});
        try { focusPersist(next); state.focus = next; callback('onFocusEvent','timerComplete'); emit('focus'); } catch (_) {}
      } else if (f.endAt !== null) emit('focus');
      var c = copy(state.clock), changed = false, t = now();
      c.alarms.slice().sort(function(a,b) { return a.at-b.at || String(a.id).localeCompare(String(b.id)); }).forEach(function(a) {
        var occurrenceId = a.id + ':' + a.at;
        if (!a.enabled || a.at > t || c.occurrences[occurrenceId]) return;
        if (t-a.at > 120000) { c.occurrences[occurrenceId] = {status:'missed'}; a.status = 'missed'; changed = true; return; }
        c.occurrences[occurrenceId] = {status:'queued', triggeredAt:t}; changed = true;
      });
      var activated = null;
      if (!c.activeAlarm) {
        var queued = c.alarms.slice().sort(function(a,b){return a.at-b.at || String(a.id).localeCompare(String(b.id));}).find(function(a){ var o=c.occurrences[a.id+':'+a.at]; return o && o.status === 'queued'; });
        if (queued) { var key=queued.id+':'+queued.at, occurrence=c.occurrences[key]; occurrence.status='active'; c.activeAlarm={id:queued.id,occurrenceId:key,label:queued.label,scheduledAt:queued.at,triggeredAt:occurrence.triggeredAt,snoozeMinutes:queued.snoozeMinutes}; activated=c.activeAlarm; changed=true; }
      }
      if (changed) { try { clockPersist(c); state.clock=c; if (activated) callback('onAlarmEvent',Object.assign({type:'activated'},activated)); emit('clock'); } catch (_) {} }
    }
    function command(id, action, payload) {
      try {
        if (!state[id]) throw Error('Panel unavailable');
        var s = copy(state[id]), event = null, alarmEvent = null;
        if (id === 'focus') {
          if (action === 'setDuration') { if (s.endAt !== null) throw Error('Timer is running'); var d = payload === 25 || payload === 50 ? payload*60000 : payload; if ([1500000,3000000].indexOf(d)<0) throw Error('Invalid duration'); s.duration=d; s.remaining=d; s.sessionId=uid(); event='timerStop'; }
          else if (action === 'reset') { s.remaining=s.duration; s.endAt=null; s.sessionId=uid(); event='timerStop'; }
          else if (action === 'toggle') { if (s.endAt !== null) { s.remaining=Math.max(0,s.endAt-now()); s.endAt=null; event='timerPause'; } else { if (s.remaining<=0) { s.remaining=s.duration; s.sessionId=uid(); } s.endAt=now()+s.remaining; event='timerRun'; } }
          else throw Error('Unknown action'); focusPersist(s);
        } else if (id === 'clock') {
          if (action === 'setZones') { if (!Array.isArray(payload) || !payload.length) throw Error('Invalid zones'); var seen={}; s.zones=payload.map(function(z){ if (!z || typeof z.id !== 'string' || !z.id || seen[z.id] || typeof z.timeZone !== 'string' || typeof z.label !== 'string' || !z.label.trim() || z.label.trim().length>48) throw Error('Invalid zone'); try { new Intl.DateTimeFormat('en',{timeZone:z.timeZone}); } catch (_) { throw Error('Invalid time zone'); } seen[z.id]=true; return {id:z.id,timeZone:z.timeZone,label:z.label.trim()}; }); }
          else if (action === 'upsertAlarm') { var a=payload; if (!a || typeof a.id !== 'string' || !a.id || typeof a.label !== 'string' || !a.label.trim() || a.label.trim().length>48 || !Number.isFinite(a.at) || typeof a.enabled !== 'boolean' || !Number.isInteger(a.snoozeMinutes == null ? 5 : a.snoozeMinutes) || (a.snoozeMinutes == null ? 5 : a.snoozeMinutes)<1 || (a.snoozeMinutes == null ? 5 : a.snoozeMinutes)>60 || (a.enabled && a.at<=now())) throw Error('Invalid alarm'); var record=Object.assign({},a,{label:a.label.trim(),snoozeMinutes:a.snoozeMinutes == null ? 5 : a.snoozeMinutes}); s.alarms=s.alarms.filter(function(x){return x.id!==a.id;}); s.alarms.push(record); }
          else if (action === 'removeAlarm') { if (!payload || typeof payload.id !== 'string') throw Error('Invalid alarm id'); s.alarms=s.alarms.filter(function(a){return a.id!==payload.id;}); }
          else if (action === 'dismissAlarm' || action === 'snoozeAlarm') {
            if (!payload || !s.activeAlarm || payload.occurrenceId!==s.activeAlarm.occurrenceId) return Promise.resolve({ok:true});
            var active=s.activeAlarm;
            s.occurrences[active.occurrenceId].status=action === 'dismissAlarm' ? 'dismissed' : 'snoozed';
            if (action === 'snoozeAlarm') {
              var alarm=s.alarms.find(function(a){return a.id===active.id;});
              if (!alarm || alarm.at!==active.scheduledAt) {
                alarm={id:active.id+'-snooze-'+uid(),label:active.label,snoozeMinutes:active.snoozeMinutes};
                s.alarms.push(alarm);
              }
              alarm.at=now()+active.snoozeMinutes*60000; alarm.enabled=true; delete alarm.status;
            }
            s.activeAlarm=null;
            alarmEvent=Object.assign({type:action === 'dismissAlarm' ? 'dismissed' : 'snoozed'},active);
          }
          else if (action === 'setPage') { if (!Number.isInteger(payload)) throw Error('Invalid page'); s.page=Math.max(0,Math.min(s.pageCount-1,payload)); state[id]=s; emit(id); return Promise.resolve({ok:true}); }
          else throw Error('Unknown action'); clockPersist(s);
        } else if (id === 'notes' && action === 'setText') { if (typeof payload !== 'string') throw Error('Invalid text'); s.text=payload; write(id,'text',payload); }
        else if (id === 'calendar') { var m; if (action === 'today') m=monthNow(); else if (action === 'setMonth') { if (!payload || !Number.isInteger(payload.year) || !Number.isInteger(payload.month) || payload.month<0 || payload.month>11) throw Error('Invalid month'); m={year:payload.year,month:payload.month}; } else if (action === 'previous' || action === 'next') { var date=new Date(0); date.setHours(12,0,0,0); date.setFullYear(s.year,s.month+(action === 'next' ? 1 : -1),1); m={year:date.getFullYear(),month:date.getMonth()}; } else throw Error('Unknown action'); s=m; write(id,'viewMonth',s); }
        else if (action === 'setPage' && Object.prototype.hasOwnProperty.call(s,'page')) { if (!Number.isInteger(payload)) throw Error('Invalid page'); s.page=Math.max(0,Math.min(s.pageCount-1,payload)); }
        else throw Error('Unknown action');
        state[id]=s; if (event) callback('onFocusEvent',event); if (alarmEvent) callback('onAlarmEvent',alarmEvent); emit(id); if (alarmEvent) tick(); return Promise.resolve({ok:true});
      } catch (e) { return Promise.resolve({ok:false,error:String(e.message || e)}); }
    }
    load();
    return {get:get, subscribe:function(id,fn){ if (!listeners[id]) listeners[id]=[]; listeners[id].push(fn); try { fn(get(id)); } catch (_) {} return function(){ listeners[id]=listeners[id].filter(function(x){return x!==fn;}); }; }, command:command, report:function(id,metadata){ var s=state[id], n=metadata && metadata.pageCount; if (!s || !Object.prototype.hasOwnProperty.call(s,'page') || !Number.isInteger(n) || n<1) return; var p=(id === 'notes' && Number.isInteger(metadata.page)) ? Math.max(0,Math.min(metadata.page,n-1)) : Math.min(s.page,n-1); if (s.pageCount===n && s.page===p) return; s.pageCount=n; s.page=p; emit(id); }, start:function(){ if (timer!==null) return; tick(); timer=scheduler.setInterval(tick,1000); }, stop:function(){ if (timer!==null) { scheduler.clearInterval(timer); timer=null; } }, reload:function(){ load(); ids.forEach(emit); if (timer!==null) tick(); }};
  }
  return {create:create};
}));

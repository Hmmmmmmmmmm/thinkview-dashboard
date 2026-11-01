var root = ctx.root, service = window.DashboardCalendar, kind = ctx.manifest.id;
var status = root.querySelector('.calendar-next-status'), list = root.querySelector('.calendar-next-list'), calendars = root.querySelector('[data-calendars]'), input = root.querySelector('[data-client-id]');
root.querySelector('[data-title]').textContent = kind === 'calendar-today' ? 'Today' : kind === 'calendar-next' ? 'Next event' : 'Agenda';
input.value = service.getClientId();
var editor=DashboardPanelFit.editor(root,root.querySelector('.calendar-next-settings'),'Google Calendar');
var cleanupPages=DashboardPanelFit.pages(root,list,43);
root.querySelector('[data-settings]').onclick=function(){editor.open();};
function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function startMs(event) { return event.start.date ? new Date(event.start.date + 'T00:00:00').getTime() : Date.parse(event.start.dateTime); }
function endMs(event) { return event.end.date ? new Date(event.end.date + 'T00:00:00').getTime() : Date.parse(event.end.dateTime); }
function render(state) {
 status.textContent = state.message; list.textContent = ''; calendars.textContent = '';
 state.calendars.forEach(function (cal) { var label=document.createElement('label'), box=document.createElement('input'); box.type='checkbox'; box.value=cal.id; box.checked=state.selected.indexOf(cal.id)>=0; label.appendChild(box); label.appendChild(document.createTextNode(cal.summary)); calendars.appendChild(label); });
 var now = new Date(), today = dateKey(now), tomorrow = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
 var events = state.events.filter(function (event) { var end=endMs(event); return isFinite(end) && end > now.getTime(); });
 if (kind === 'calendar-today') events = events.filter(function (event) { return event.start.date ? event.start.date <= today && event.end.date > today : startMs(event) < tomorrow; });
 if (kind === 'calendar-next') events = events.slice(0,1);
 if (!events.length && (state.status === 'ready' || state.status === 'partial') && state.selected.length) { var empty=document.createElement('p'); empty.textContent='No events in this view.'; list.appendChild(empty); }
 events.forEach(function (event) { var item=document.createElement('div'), time=document.createElement('time'), title=document.createElement('div'); item.className='calendar-next-item'; time.dateTime=event.start.dateTime || event.start.date || ''; time.textContent=event.start.date ? event.start.date + ' · All day' : new Date(event.start.dateTime).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); title.textContent=event.title; item.appendChild(time); item.appendChild(title); list.appendChild(item); });
}
function connect() { service.setClientId(input.value); service.connect(); }
function disconnect() { service.disconnect(); }
function refresh() { service.refresh(); }
function select() { service.select(Array.from(calendars.querySelectorAll('input:checked')).map(function (box) { return box.value; })); }
root.querySelector('[data-connect]').addEventListener('click',connect); root.querySelector('[data-disconnect]').addEventListener('click',disconnect); root.querySelector('[data-refresh]').addEventListener('click',refresh); calendars.addEventListener('change',select);
var unsubscribe=service.subscribe(render);
return function () { editor.destroy(); cleanupPages(); root.querySelector('[data-settings]').onclick=null; unsubscribe(); root.querySelector('[data-connect]').removeEventListener('click',connect); root.querySelector('[data-disconnect]').removeEventListener('click',disconnect); root.querySelector('[data-refresh]').removeEventListener('click',refresh); calendars.removeEventListener('change',select); };

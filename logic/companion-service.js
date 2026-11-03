// Optional companion backend. The frontend never owns account sessions.
(function () {
  "use strict";
  function sameOriginTransport() {
    var token = null;
    async function request(path, method, body, signal) {
      var headers = {};
      if (body) { headers['Content-Type'] = 'application/json'; headers['X-ThinkView-Token'] = token; }
      var response = await fetch('/api/companion/v1/' + path, { method: method, credentials: 'same-origin', cache: 'no-store', headers: headers, body: body ? JSON.stringify(body) : undefined, signal: signal });
      if (!response.ok) throw Error('Companion backend unavailable');
      var text = await response.text();
      if (text.length > 8192) throw Error('Companion response too large');
      return JSON.parse(text);
    }
    return {
      capabilities: async function (signal) {
        var result = await request('capabilities', 'GET', null, signal);
        if (!result || typeof result.csrfToken !== 'string' || !result.csrfToken || result.csrfToken.length > 512) throw Error('Invalid companion transport');
        token = result.csrfToken;
        return {version:result.version, provider:result.provider, capabilities:result.capabilities};
      },
      status: function (signal) { return request('status', 'GET', null, signal); },
      open: function (signal) { return request('commands', 'POST', {command:'open'}, signal); },
      dispose: function () { token = null; }
    };
  }
  function create(transport) {
    transport = transport || sameOriginTransport();
    var disposed = false, generation = 0, pending = new Set(), snapshot = {available:false, open:false, view:'closed', auth:'unknown'};
    function timed(method) {
      var controller = new AbortController(), timer, entry = {controller:controller, reject:null}; pending.add(entry);
      return new Promise(function (resolve, reject) {
        entry.reject = reject;
        timer = setTimeout(function () { controller.abort(); reject(Error('Companion request timed out')); }, 3000);
        Promise.resolve().then(function () { return transport[method](controller.signal); }).then(resolve, reject);
      }).finally(function () { clearTimeout(timer); pending.delete(entry); });
    }
    function validCapabilities(c) {
      var names = ['open','authStatus','read','send','call'];
      return c && c.version === 1 && typeof c.provider === 'string' && c.provider.length > 0 && c.provider.length <= 80 && c.capabilities && names.every(function (name) { return typeof c.capabilities[name] === 'boolean'; });
    }
    function validStatus(s) { return s && s.version === 1 && ['available','unavailable','error'].indexOf(s.availability) >= 0 && ['closed','opening','open','error'].indexOf(s.view) >= 0 && s.auth === 'unknown'; }
    return {
      refresh: async function () {
        if (disposed) return snapshot;
        var own = ++generation;
        try {
          var c = await timed('capabilities');
          if (!validCapabilities(c)) throw Error('Invalid companion capabilities');
          var s = await timed('status');
          if (!validStatus(s)) throw Error('Invalid companion status');
          if (!disposed && own === generation) snapshot = {available:s.availability === 'available', open:s.availability === 'available' && c.capabilities.open, view:s.view, auth:'unknown'};
        } catch (_) { if (!disposed && own === generation) snapshot = {available:false, open:false, view:'closed', auth:'unknown'}; }
        return snapshot;
      },
      state: function () { return Object.assign({}, snapshot); },
      open: async function () {
        if (disposed || !snapshot.available || !snapshot.open) throw Error('Companion open unavailable');
        var own = generation, result = await timed('open');
        if (disposed || own !== generation) throw Error('Companion request cancelled');
        if (!result || result.ok !== true) throw Error('Companion open failed');
        return true;
      },
      dispose: function () { disposed = true; generation++; pending.forEach(function (entry) { entry.controller.abort(); entry.reject(Error('Companion request cancelled')); }); pending.clear(); if (transport.dispose) transport.dispose(); }
    };
  }
  function lifecycle(target, factory) {
    factory = factory || create;
    var current = null, stopped = false;
    function start() { if (stopped || current) return; current = factory(); current.refresh(); }
    function hide() { if (current) current.dispose(); current = null; }
    function show(event) { if (event.persisted) start(); }
    target.addEventListener('pagehide', hide);
    target.addEventListener('pageshow', show);
    start();
    return {
      current: function () { return current; },
      dispose: function () { if (stopped) return; stopped = true; target.removeEventListener('pagehide', hide); target.removeEventListener('pageshow', show); hide(); }
    };
  }
  window.DashboardCompanion = {create:create, sameOriginTransport:sameOriginTransport, lifecycle:lifecycle};
})();

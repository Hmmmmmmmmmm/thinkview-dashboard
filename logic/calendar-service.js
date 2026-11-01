// Google Calendar read-only access. Tokens remain in memory and require user interaction.
(function () {
  "use strict";
  var scope = "https://www.googleapis.com/auth/calendar.readonly";
  var state = { status: "disconnected", message: "Connect Google Calendar to see events.", calendars: [], selected: [], events: [] };
  var listeners = new Set(), token = null, expiresAt = 0, client = null, request = null, generation = 0, authGeneration = 0, timer = null;
  var storage = DashboardStorage.local(DashboardConfig.storagePrefix + "calendar.");
  var clientId = storage.get("clientId", ""), savedSelection = storage.get("selected", null);
  function clearAccount() { token = null; expiresAt = 0; state.calendars = []; state.selected = []; state.events = []; }
  function emit() { listeners.forEach(function (fn) { fn(state); }); }
  function setStatus(status, message) { state.status = status; state.message = message; emit(); }
  function loadIdentity() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = resolve;
      script.onerror = function () { reject(Error("Google sign-in could not load. Check your connection.")); };
      document.head.appendChild(script);
    });
  }
  function pages(path, params, signal, current) {
    var result = [];
    function next(pageToken) {
      var query = new URLSearchParams(params || {});
      if (pageToken) query.set("pageToken", pageToken);
      return fetch("https://www.googleapis.com/calendar/v3/" + path + "?" + query.toString(), {
        headers: { Authorization: "Bearer " + token }, signal: signal
      }).then(function (response) {
        if (current !== generation) { var obsolete = Error("Obsolete calendar request"); obsolete.name = "AbortError"; throw obsolete; }
        if (response.status === 401) { clearAccount(); throw Error("Sign-in expired. Connect again."); }
        if (!response.ok) throw Error("Calendar request failed (" + response.status + ").");
        return response.json();
      }).then(function (data) {
        result = result.concat(data.items || []);
        return data.nextPageToken ? next(data.nextPageToken) : result;
      });
    }
    return next();
  }
  function refresh() {
    if (!token) return Promise.resolve();
    if (Date.now() >= expiresAt) { clearAccount(); setStatus("disconnected", "Sign-in expired. Connect again."); return Promise.resolve(); }
    if (request) request.abort();
    request = new AbortController();
    var current = ++generation, signal = request.signal;
    state.events = [];
    setStatus("loading", "Loading calendars and events…");
    return pages("users/me/calendarList", { maxResults: "250" }, signal, current).then(function (calendars) {
      if (current !== generation) return;
      state.calendars = calendars.map(function (cal) { return { id: cal.id, summary: cal.summaryOverride || cal.summary || "Untitled calendar", primary: !!cal.primary }; });
      if (Array.isArray(savedSelection)) state.selected = savedSelection.filter(function (id) { return state.calendars.some(function (cal) { return cal.id === id; }); });
      else state.selected = state.calendars.filter(function (cal) { return cal.primary; }).map(function (cal) { return cal.id; });
      var start = new Date(), end = new Date(); start.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 31); end.setHours(0, 0, 0, 0);
      return Promise.all(state.selected.map(function (id) {
        return pages("calendars/" + encodeURIComponent(id) + "/events", { timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" }, signal, current)
          .then(function (events) { return { id: id, events: events }; }, function (error) { if (error.name === "AbortError") throw error; return { id: id, error: error }; });
      })).then(function (results) {
        if (current !== generation) return;
        var errors = results.filter(function (r) { return r.error; });
        if (!token) { state.events = []; setStatus("disconnected", "Sign-in expired. Connect again."); return; }
        state.events = [].concat.apply([], results.map(function (r) { return (r.events || []).filter(function (event) { return event.status !== "cancelled"; }).map(function (event) { return { id: event.id, calendarId: r.id, title: event.summary || "Untitled event", start: event.start || {}, end: event.end || {}, htmlLink: event.htmlLink }; }); }));
        state.events.sort(function (a, b) { function instant(e) { return Date.parse(e.start.dateTime || (e.start.date + "T00:00:00")); } return instant(a) - instant(b); });
        setStatus(errors.length ? "partial" : "ready", errors.length ? "Some calendars could not be loaded. Refresh to retry." : state.selected.length ? "" : "Select at least one calendar.");
      });
    }).catch(function (error) { if (error.name === "AbortError" || current !== generation) return; state.events = []; setStatus(token ? "error" : "disconnected", error.message || "Calendar is unavailable."); });
  }
  window.DashboardCalendar = {
    subscribe: function (fn) {
      listeners.add(fn); fn(state);
      if (!timer) { timer = setInterval(refresh, 5 * 60000); if (token) refresh(); }
      return function () { listeners.delete(fn); if (!listeners.size) { clearInterval(timer); timer = null; generation++; authGeneration++; if (request) request.abort(); if (state.status === "loading") { state.status = token ? "ready" : "disconnected"; state.message = token ? "Refresh to update events." : "Connect Google Calendar to see events."; } } };
    },
    getClientId: function () { return clientId; },
    setClientId: function (value) { clientId = String(value || "").trim(); storage.set("clientId", clientId); },
    connect: function () {
      var auth = ++authGeneration;
      generation++; if (request) request.abort(); clearAccount();
      if (!clientId) { setStatus("error", "Enter a Google OAuth web client ID first."); return; }
      var origin = new URL(document.baseURI);
      if (origin.protocol !== "https:" && !(origin.protocol === "http:" && (origin.hostname === "localhost" || origin.hostname === "127.0.0.1"))) { setStatus("error", "Google sign-in requires a registered HTTPS or localhost origin; file URLs are unsupported."); return; }
      if (!(window.google && google.accounts && google.accounts.oauth2)) {
        setStatus("loading", "Loading Google sign-in…");
        loadIdentity().then(function () { if (auth === authGeneration) setStatus("disconnected", "Google sign-in is ready. Select Connect to continue."); }).catch(function (error) { if (auth === authGeneration) setStatus("error", error.message); });
        return;
      }
      try {
        client = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: scope, callback: function (response) {
          if (auth !== authGeneration) return;
          if (response.error) { setStatus("error", "Google sign-in failed: " + response.error); return; }
          token = response.access_token; expiresAt = Date.now() + Math.max(0, Number(response.expires_in || 0) - 30) * 1000; refresh();
        }, error_callback: function () { if (auth === authGeneration) setStatus("error", "Google sign-in was closed or could not open."); } });
        client.requestAccessToken();
      } catch (error) { if (auth === authGeneration) setStatus("error", error.message); }
    },
    disconnect: function () { generation++; authGeneration++; if (request) request.abort(); var old = token; clearAccount(); if (old && window.google && google.accounts.oauth2) google.accounts.oauth2.revoke(old, function () {}); setStatus("disconnected", "Google Calendar disconnected."); },
    select: function (ids) { savedSelection = ids.slice(); storage.set("selected", savedSelection); return refresh(); },
    refresh: refresh
  };
})();

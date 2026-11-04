/* Runs only inside the opaque-origin preview frame. */
(function () {
  "use strict";
  const config = JSON.parse(
    document.getElementById("frame-config").textContent,
  );
  const manifest = config.manifest,
    id = manifest.id;
  const send = (type, data) =>
    parent.postMessage({ studio: config.token, type, data }, "*");
  const describe = (v) => {
    try {
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch (_) {
      return String(v);
    }
  };
  const log = (level, ...args) =>
    send("log", { level, message: args.map(describe).join(" ") });
  for (const level of ["log", "info", "warn", "error", "debug"])
    console[level] = (...args) => log(level, ...args);
  window.addEventListener("error", (e) =>
    log("error", e.message + " (" + e.lineno + ":" + e.colno + ")"),
  );
  window.addEventListener("unhandledrejection", (e) =>
    log(
      "error",
      "Unhandled promise: " +
        ((e.reason && (e.reason.stack || e.reason.message)) || e.reason),
    ),
  );
  window.addEventListener("securitypolicyviolation", (e) =>
    log("warn", "Preview blocked " + e.violatedDirective + ": " + e.blockedURI),
  );
  const nativeFetch = window.fetch.bind(window);
  const dataAPI = PanelDataAPI.create(config.fixture, {
    fetch: nativeFetch,
    report: (entry) => send("api-request", entry),
  });
  window.fetch = dataAPI.fetch;
  const fixture = dataAPI.snapshot();
  const calendarListeners = new Set();
  let calendarState = structuredClone(
    (fixture.enabled && fixture.calendar) || {
      status: "disconnected",
      message: "Enable Data API fixtures to supply calendar events.",
      calendars: [],
      selected: [],
      events: [],
    },
  );
  const calendarSnapshot = () => ({
    ...structuredClone(calendarState),
    events: structuredClone(
      calendarState.events.filter(
        (event) =>
          calendarState.selected.length &&
          (!event.calendarId ||
            calendarState.selected.includes(event.calendarId)),
      ),
    ),
  });
  const emitCalendar = () =>
    calendarListeners.forEach((fn) => fn(calendarSnapshot()));
  window.DashboardCalendar = {
    subscribe(fn) {
      calendarListeners.add(fn);
      fn(calendarSnapshot());
      return () => calendarListeners.delete(fn);
    },
    getClientId: () => "Studio fixture — no account connection",
    setClientId() {},
    connect() {
      log("info", "Calendar connect is simulated; no OAuth request was sent");
      if (fixture.enabled && fixture.calendar)
        calendarState = structuredClone(fixture.calendar);
      emitCalendar();
    },
    disconnect() {
      calendarState = {
        status: "disconnected",
        message: "Fixture calendar disconnected",
        calendars: [],
        selected: [],
        events: [],
      };
      emitCalendar();
    },
    select(ids) {
      calendarState.selected = ids.filter((key) =>
        calendarState.calendars.some((cal) => cal.id === key),
      );
      emitCalendar();
      return Promise.resolve();
    },
    refresh() {
      emitCalendar();
      return Promise.resolve();
    },
  };
  const state = Object.assign(Object.create(null), config.storage || {}),
    notices = new Map(),
    listeners = new Set();
  if (id === "clock" && fixture.enabled && fixture.clockSettings) state.settings = structuredClone(fixture.clockSettings);
  let base = config.size,
    pinned = config.pinned,
    enabled = true,
    counter = 0,
    lease,
    attention = null;
  let acknowledged = Array.isArray(state["attention-acknowledged"]) ? state["attention-acknowledged"].slice(-128) : [];
  const priorities = ["emergency", "high", "medium", "low"],
    presentations = {
      emergency: "alert",
      high: "toast",
      medium: "list",
      low: "list",
    };
  const panel = document.querySelector(".board>.panel");
  function currentState() {
    send("state", {
      enabled,
      pinned,
      base,
      temporary: expansion.effective(id),
      effective: DashboardAttention.size(expansion.effective(id), attention && DashboardAttention.resolve(attention, manifest)),
      attention: attention && attention.id,
      storage: state,
      notifications: notices.size,
    });
  }
  function render() {
    attention = DashboardAttention.select(
      Array.from(notices.values()).filter((entry) => DashboardAttention.resolve(entry, manifest)),
      () => enabled && !pinned,
    );
    panel.classList.toggle("has-attention", !!attention);
    send("attention-state", !!attention);
    const effective = DashboardAttention.size(
      expansion.effective(id),
      attention && DashboardAttention.resolve(attention, manifest),
    );
    send("size", effective);
    send(
      "notifications",
      Array.from(notices.values()).map(({ onActivate, content, ...entry }) => ({
        ...entry,
        active: attention && attention.id === entry.id,
        canActivate: typeof onActivate === "function",
      })),
    );
    currentState();
  }
  const expansion = DashboardExpansion.create(
    [manifest],
    () => base,
    () => enabled && !pinned,
    render,
  );
  const notifications = {
    publish(item) {
      if (!item || typeof item.title !== "string")
        throw Error("A notification title is required");
      const key = String(item.id || "notification-" + ++counter),
        priority = priorities.includes(item.priority)
          ? item.priority
          : "medium";
      const entry = {
        id: key,
        title: item.title,
        message: String(item.message || ""),
        priority,
        source: String(item.source || "panel"),
        panelId: item.panelId === id ? id : null,
        occurrenceId: item.occurrenceId ? String(item.occurrenceId) : null,
        layoutEvent: item.layoutEvent ? String(item.layoutEvent) : null,
        onActivate: item.onActivate,
        content: item.content || null,
      };
      if (entry.occurrenceId && acknowledged.includes(entry.panelId + ":" + entry.occurrenceId)) return key;
      notices.set(key, entry);
      log("info", "notification.publish", {
        id: key,
        priority,
        panelId: entry.panelId,
      });
      render();
      listeners.forEach((fn) => fn(notifications.list()));
      return key;
    },
    dismiss(key) {
      if (notices.delete(String(key))) {
        log("info", "notification.dismiss", key);
        render();
        listeners.forEach((fn) => fn(notifications.list()));
      }
    },
    list: () => Array.from(notices.values()),
    subscribe(fn) {
      listeners.add(fn);
      fn(notifications.list());
      return () => listeners.delete(fn);
    },
  };
  window.DashboardConfig = { storagePrefix: "studio." };
  window.DashboardStorage = {
    local() {
      return {
        get(key, fallback) {
          return Object.hasOwn(state, key)
            ? structuredClone(state[key])
            : fallback;
        },
        set(key, value) {
          try {
            state[key] = JSON.parse(JSON.stringify(value));
            send("storage", state);
            log("debug", "storage.set", key);
            currentState();
            return true;
          } catch (e) {
            log("error", "Storage: " + e.message);
            return false;
          }
        },
      };
    },
  };
  const unavailable = (name) => () => {
    log("warn", name + " requires the dashboard host; unavailable in Studio");
    return () => {};
  };
  const memoryStores = Object.create(null);
  const panelState = DashboardPanelState.create({
    storageForPanel(panelId) {
      if (panelId === id) return window.DashboardStorage.local();
      const store = memoryStores[panelId] ||= Object.create(null);
      return { get: (key, fallback) => Object.hasOwn(store, key) ? store[key] : fallback,
        set: (key, value) => { store[key] = structuredClone(value); return true; } };
    },
    onAlarmEvent: alarmEvent,
    onFocusEvent: focusEvent,
  });
  function focusEvent(event) {
    if (id !== "focus") return;
    expansion.bind(id).emit(event);
    if (event === "timerComplete") {
      const session = panelState.get("focus").sessionId;
      notifications.publish({id:"focus-complete:" + session, panelId:"focus", occurrenceId:session, layoutEvent:"showComplete", priority:"high", title:"Focus complete"});
    } else if (event === "timerStop" || event === "timerRun") {
      notifications.list().filter((entry) => entry.panelId === "focus" && entry.layoutEvent === "showComplete").forEach((entry) => {
        const key = "focus:" + entry.occurrenceId;
        acknowledged = acknowledged.filter((value) => value !== key).concat(key).slice(-128);
        state["attention-acknowledged"] = acknowledged;
        send("storage", state);
        notifications.dismiss(entry.id);
      });
    }
  }
  function alarmEvent(event) {
    if (id !== "clock" || !event || !event.occurrenceId) return;
    const key = "clock-alarm:" + event.occurrenceId;
    if (event.type === "activated") notifications.publish({id: key, panelId: "clock", occurrenceId: event.occurrenceId, layoutEvent: "showAlarm", priority: "high", title: event.label || "Alarm"});
    else {
      const ack = "clock:" + event.occurrenceId;
      acknowledged = acknowledged.filter((value) => value !== ack).concat(ack).slice(-128);
      state["attention-acknowledged"] = acknowledged;
      send("storage", state);
      notifications.dismiss(key);
    }
  }
  function dismissAttention(entry = attention) {
    if (!entry) return;
    const key = entry.panelId + ":" + entry.occurrenceId;
    acknowledged = acknowledged.filter((value) => value !== key).concat(key).slice(-128);
    state["attention-acknowledged"] = acknowledged;
    send("storage", state);
    notifications.dismiss(entry.id);
    const active = panelState.get("clock").activeAlarm;
    if (entry.panelId === "clock" && active && active.occurrenceId === entry.occurrenceId)
      panelState.command("clock", "dismissAlarm", {occurrenceId: entry.occurrenceId});
  }
  const restoredAlarm = panelState.get("clock").activeAlarm;
  if (restoredAlarm) alarmEvent({...restoredAlarm, type: "activated"});
  panelState.start();
  window.addEventListener("pagehide", () => panelState.stop());
  const host = {
    companion: {
      subscribe(fn) {
        const supplied = config.appData && config.appData.companion;
        fn(supplied && typeof supplied === "object" ? structuredClone(supplied) : {availability:"unavailable", view:"closed", conversation:null});
        return () => {};
      },
      subscribeDraft(fn) { fn(false); return () => {}; },
      refresh() { return Promise.resolve(); },
    },
    panelState,
    deviceInfo: fixture.enabled && fixture.device_info ? {subscribe(fn) { fn(structuredClone(fixture.device_info)); return () => {}; }} : fixture.enabled ? window.ThinkViewDevice : {subscribe(fn) { fn({available:false,status:null,commands:[]}); return () => {}; }},
    panelSettings(panelId) { return fixture.enabled && fixture.panel_settings && Object.hasOwn(fixture.panel_settings, panelId) ? structuredClone(fixture.panel_settings[panelId]) : undefined; },
    setPanelSettings(panelId, value) { if (fixture.enabled && fixture.panel_settings && Object.hasOwn(fixture.panel_settings, panelId)) fixture.panel_settings[panelId] = structuredClone(value); },
    data: config.appData || {},
    http: {
      async get(url, options = {}) {
        if (id !== "weather" || !config.manifest.networkOrigins?.includes("https://api.caiyunapp.com"))
          throw new Error("Weather transport unavailable");
        const response = await nativeFetch("http://127.0.0.1:8768/api/transport/caiyun", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }), signal: options.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Weather transport failed");
        return response;
      },
    },
    notifications,
    layout: {
      bind(panelId) {
        lease = expansion.bind(panelId);
        return {
          emit(name) {
            const ok = lease.emit(name);
            log(ok ? "info" : "warn", "layout.emit", {
              name,
              accepted: ok,
              pinned,
            });
            currentState();
            return ok;
          },
          dispose() {
            lease.dispose();
            log("info", "layout.dispose");
          },
        };
      },
    },
    core: {
      clock: unavailable("core.clock"),
      weather: unavailable("core.weather"),
      dot: unavailable("core.dot"),
    },
  };
  const pinch = DashboardExpansion.gesture();
  panel.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && manifest.expansion && manifest.expansion.pinch) pinch.down(id, e.pointerId, e.clientX, e.clientY);
  });
  document.addEventListener("pointermove", (e) => { pinch.move(e.pointerId, e.clientX, e.clientY); if (pinch.active) e.preventDefault(); }, {passive: false});
  document.addEventListener("pointerup", (e) => { const result = pinch.up(e.pointerId); if (result && result.direction === -1) dismissAttention(); });
  document.addEventListener("pointercancel", () => pinch.cancel());
  function mount() {
    panel.hidden = false;
    enabled = true;
    DisplayPanels.start(host);
    const failures = DisplayPanels.startupErrors();
    send("mounted", { ok: !failures.length });
    log(
      failures.length ? "error" : "info",
      failures.length ? "Mount failed" : "Panel mounted",
      id,
    );
    render();
  }
  function stop() {
    enabled = false;
    pinch.cancel();
    panel.hidden = true;
    DisplayPanels.stop(id);
    expansion.clear();
    log("info", "Panel unmounted", id);
    send("mounted", { ok: false, disabled: true });
    render();
  }
  let visualPicking = false;
  panel.addEventListener("click", (event) => {
    if (!visualPicking) return;
    event.preventDefault(); event.stopImmediatePropagation();
    let node = event.target, path = [];
    while (node && node !== panel) {
      const parent = node.parentElement; if (!parent) return;
      path.unshift(Array.prototype.indexOf.call(parent.children, node)); node = parent;
    }
    if (node === panel && path.length) send("visual-select", {path, tag: event.target.localName, identity: {id: event.target.id, className: typeof event.target.className === "string" ? event.target.className : ""}});
  }, true);
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      !event.data ||
      event.data.studio !== config.token
    )
      return;
    const { type, data } = event.data;
    try {
      if (type === "visual-pick") visualPicking = data === true;
      if (type === "dismiss-attention") dismissAttention();
      if (type === "publish")
        notifications.publish({
          ...data,
          panelId: data.bound ? id : null,
          source: "studio",
        });
      if (type === "dismiss") { const entry = notices.get(String(data)); if (entry && entry.panelId && entry.occurrenceId) dismissAttention(entry); else notifications.dismiss(data); }
      if (type === "activate") {
        const entry = notices.get(data);
        if (entry && typeof entry.onActivate === "function") {
          entry.onActivate();
          log("info", "notification.activate", data);
        }
      }
      if (type === "clear")
        Array.from(notices.keys()).forEach((key) => notifications.dismiss(key));
      if (type === "size") {
        base = data;
        expansion.restore(id);
        render();
      }
      if (type === "expression" && ["Quiet", "Standard", "Expressive", "Original"].includes(data)) document.documentElement.dataset.previewExpression = data;
      if (type === "theme") document.documentElement.dataset.theme = data;
      if (type === "theme-colors" && typeof data === "string") document.getElementById("studio-color-overrides").textContent = data;
      if (type === "pinned") {
        pinned = data;
        render();
      }
      if (type === "presentation") presentations[data.priority] = data.behavior;
      if (type === "emit") {
        if (enabled && lease) {
          const ok = lease.emit(data);
          log(ok ? "info" : "warn", "Debug layout event", {
            name: data,
            accepted: ok,
          });
        } else log("warn", "Enable the panel before emitting an event");
      }
      if (type === "restore") {
        expansion.restore(id);
        render();
      }
      if (type === "toggle") {
        if (enabled) stop();
        else mount();
      }
      if (type === "shutdown") {
        stop();
        send("stopped");
      }
      if (type === "remount") {
        stop();
        mount();
      }
      if (type === "storage-reset") {
        stop();
        for (const key of Object.keys(state)) delete state[key];
        acknowledged = [];
        send("storage", state);
        mount();
      }
    } catch (e) {
      log("error", e.stack || e.message);
    }
  });
  try {
    DisplayPanels.register(
      manifest,
      new Function(
        "ctx",
        config.script + "\n//# sourceURL=panel-" + id + ".js",
      ),
    );
    mount();
  } catch (e) {
    log("error", e.stack || e.message);
    send("mounted", { ok: false });
  }
})();

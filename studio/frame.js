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
  const dataAPI = PanelDataAPI.create(config.fixture, {
    fetch: window.fetch.bind(window),
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
  let base = config.size,
    pinned = config.pinned,
    enabled = true,
    counter = 0,
    lease,
    attention = null;
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
      effective: DashboardAttention.size(expansion.effective(id), !!attention),
      attention: attention && attention.id,
      storage: state,
      notifications: notices.size,
    });
  }
  function render() {
    attention = DashboardAttention.select(
      Array.from(notices.values()),
      () => enabled && !pinned,
    );
    panel
      .querySelectorAll(":scope > .attention-card")
      .forEach((el) => el.remove());
    panel.classList.toggle("has-attention", !!attention);
    if (attention) {
      const card = document.createElement("div");
      card.className = "attention-card";
      const add = (tag, cls, value) => {
        const el = document.createElement(tag);
        el.className = cls;
        el.textContent = String(value || "");
        card.append(el);
        return el;
      };
      add(
        "div",
        "attention-eyebrow",
        "STUDIO · " + attention.priority + " attention",
      );
      add("h2", "attention-title", attention.title);
      if (attention.content && attention.content.hero)
        add("div", "attention-hero", attention.content.hero);
      add("p", "attention-message", attention.message);
      const actions = add("div", "attention-actions", "");
      for (const action of attention.content &&
      Array.isArray(attention.content.actions)
        ? attention.content.actions.slice(0, 3)
        : []) {
        const button = document.createElement("button");
        button.textContent = String(action.label || "Open");
        button.onclick = () => {
          if (typeof action.run === "function") action.run();
        };
        actions.append(button);
      }
      const dismiss = document.createElement("button");
      dismiss.textContent = "Dismiss";
      dismiss.onclick = () => notifications.dismiss(attention.id);
      actions.append(dismiss);
      panel.append(card);
    }
    const effective = DashboardAttention.size(
      expansion.effective(id),
      !!attention,
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
        onActivate: item.onActivate,
        content: item.content || null,
      };
      notices.set(key, entry);
      log("info", "notification.publish", {
        id: key,
        priority,
        panelId: entry.panelId,
      });
      render();
      listeners.forEach((fn) => fn(notifications.list()));
      if (presentations[priority] !== "list")
        send("presentation", {
          behavior: presentations[priority],
          title: entry.title,
          message: entry.message,
        });
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
  const host = {
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
    panel.hidden = true;
    DisplayPanels.stop(id);
    expansion.clear();
    log("info", "Panel unmounted", id);
    send("mounted", { ok: false, disabled: true });
    render();
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      !event.data ||
      event.data.studio !== config.token
    )
      return;
    const { type, data } = event.data;
    try {
      if (type === "publish")
        notifications.publish({
          ...data,
          panelId: data.bound ? id : null,
          source: "studio",
        });
      if (type === "dismiss") notifications.dismiss(data);
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
      if (type === "theme") document.documentElement.dataset.theme = data;
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

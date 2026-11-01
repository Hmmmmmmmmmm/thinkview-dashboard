// Optional same-origin device provider. No command is sent without a panel action.
(function () {
  "use strict";
  var listeners = new Set(), timer = null, controller = null, generation = 0;
  var token = null, commands = [], snapshot = { available: false, status: null, commands: [] };
  var allowed = {
    "audio.media": function (v) { return Number.isInteger(v) && v >= 0; },
    "audio.notification": function (v) { return Number.isInteger(v) && v >= 0; },
    "wifi.enabled": function (v) { return typeof v === "boolean"; },
    "bluetooth.enabled": function (v) { return typeof v === "boolean"; },
    "display.brightness": function (v) { return Number.isInteger(v) && v >= 0 && v <= 100; },
    "display.orientation": function (v) { return ["auto", "portrait", "landscape"].indexOf(v) >= 0; },
    "display.keepAwake": function (v) { return typeof v === "boolean"; }
  };
  function notify() { listeners.forEach(function (fn) { try { fn(snapshot); } catch (e) { console.error("Device panel update failed", e); } }); }
  function value(obj, key, type) { return obj && typeof obj[key] === type ? obj[key] : null; }
  function level(obj) {
    return obj && Number.isInteger(obj.value) && Number.isInteger(obj.max) && obj.max >= 0 && obj.value >= 0 && obj.value <= obj.max ? { value: obj.value, max: obj.max } : null;
  }
  function radio(obj) {
    var states = ["on", "off", "turning-on", "turning-off", "unavailable"];
    return obj && states.indexOf(obj.state) >= 0 ? { state: obj.state, enabled: value(obj, "enabled", "boolean") } : null;
  }
  function parseStatus(data) {
    if (!data || data.version !== 1) throw Error("Unsupported device status");
    var audio = data.audio || {}, conn = data.connectivity || {}, display = data.display || {}, battery = data.battery || {};
    return {
      audio: { media: level(audio.media), notification: level(audio.notification) },
      connectivity: { wifi: radio(conn.wifi), bluetooth: radio(conn.bluetooth) },
      display: {
        available: display.available === true,
        brightness: Number.isInteger(display.brightness) && display.brightness >= 0 && display.brightness <= 100 ? display.brightness : null,
        orientation: ["auto", "portrait", "landscape"].indexOf(display.orientation) >= 0 ? display.orientation : null,
        keepAwake: value(display, "keepAwake", "boolean")
      },
      battery: { level: typeof battery.level === "number" && Number.isFinite(battery.level) && battery.level >= 0 && battery.level <= 100 ? battery.level : null, charging: value(battery, "charging", "boolean") },
      network: value(data, "network", "string"), host: value(data, "host", "string"), engine: value(data, "engine", "string"), appVersion: value(data, "appVersion", "string")
    };
  }
  async function json(url, options) {
    var response = await fetch(url, options);
    if (!response.ok) throw Error("Device provider unavailable");
    return response.json();
  }
  async function poll(myGeneration) {
    if (!listeners.size || myGeneration !== generation) return;
    controller = new AbortController();
    try {
      if (!token) {
        var caps = await json("/api/device/v1/capabilities", { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if (!caps || caps.version !== 1 || typeof caps.token !== "string" || !caps.token || !Array.isArray(caps.commands) || !caps.commands.every(function (c) { return typeof c === "string"; })) throw Error("Unsupported device provider");
        token = caps.token;
        commands = caps.commands.filter(function (c) { return Object.prototype.hasOwnProperty.call(allowed, c); });
      }
      var data = await json("/api/device/v1/status", { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (myGeneration !== generation) return;
      snapshot = { available: true, status: parseStatus(data), commands: commands.slice() };
    } catch (e) {
      if (myGeneration !== generation) return;
      token = null; commands = [];
      snapshot = { available: false, status: null, commands: [] };
    }
    if (myGeneration !== generation) return;
    controller = null; notify();
    if (listeners.size) timer = setTimeout(function () { poll(myGeneration); }, 15000);
  }
  window.ThinkViewDevice = {
    subscribe: function (fn) {
      listeners.add(fn); fn(snapshot);
      if (listeners.size === 1) { generation++; poll(generation); }
      return function () {
        listeners.delete(fn);
        if (!listeners.size) {
          generation++; clearTimeout(timer); timer = null;
          if (controller) controller.abort(); controller = null;
          token = null; commands = []; snapshot = { available: false, status: null, commands: [] };
        }
      };
    },
    command: async function (name, value) {
      if (!token || commands.indexOf(name) < 0 || !allowed[name] || !allowed[name](value)) throw Error("This control is unavailable");
      var result = await json("/api/device/v1/commands", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-ThinkView-Token": token }, body: JSON.stringify({ command: name, value: value }) });
      if (!result || typeof result.ok !== "boolean") throw Error("Invalid device response");
      if (!result.ok) throw Error(typeof result.error === "string" ? result.error : "Device request failed");
      // A successful request is not confirmation of the resulting state.
      if (listeners.size && !controller) { clearTimeout(timer); poll(generation); }
      return result;
    }
  };
})();

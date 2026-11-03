// Optional same-origin device provider. No command is sent without a panel action.
(function () {
  "use strict";
  var listeners = new Set(), intervals = new Map(), timer = null, controller = null, generation = 0;
  var capsMusicLevelVersion = 0;
  var token = null, commands = [], snapshot = { available: false, status: null, commands: [] };
  var allowed = {
    "audio.media": function (v) { return Number.isInteger(v) && v >= 0; },
    "audio.notification": function (v) { return Number.isInteger(v) && v >= 0; },
    "wifi.enabled": function (v) { return typeof v === "boolean"; },
    "bluetooth.enabled": function (v) { return typeof v === "boolean"; },
    "display.brightness": function (v) { return Number.isInteger(v) && v >= 0 && v <= 100; },
    "display.orientation": function (v) { return ["auto", "portrait", "landscape"].indexOf(v) >= 0; },
    "music.access": function (v) { return v === true; },
    "music.levelAccess": function (v) { return typeof v === "boolean"; },
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
  function audioLevel(data) {
    var states = ["disabled", "permission_required", "permission_denied", "waiting", "active", "stale", "unsupported", "error"];
    if (!data || states.indexOf(data.state) < 0) return null;
    var result = { enabled: typeof data.enabled === "boolean" ? data.enabled : null, state: data.state, available: false, value: null, measuredAt: null, staleAfterMs: null };
    if (data.state !== "active" || data.available !== true) return result;
    var now = Date.now();
    if (typeof data.value !== "number" || !Number.isFinite(data.value) || data.value < 0 || data.value > 1 || data.unit !== "normalized_peak" || data.source !== "android_output_mix_visualizer" || !Number.isFinite(data.measuredAt) || !Number.isFinite(data.staleAfterMs) || data.staleAfterMs <= 0 || data.staleAfterMs > 1000 || data.measuredAt > now || now - data.measuredAt > data.staleAfterMs) { result.state = "stale"; return result; }
    result.available = true; result.value = data.value; result.measuredAt = data.measuredAt; result.staleAfterMs = data.staleAfterMs;
    return result;
  }
  function music(data) {
    if (!data || data.supported !== true) return null;
    var states = ['idle','playing','paused','buffering'];
    function text(key) { return typeof data[key] === 'string' ? data[key].slice(0,240) : ''; }
    function time(key) { return typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0 ? data[key] : null; }
    return { audioLevel:audioLevel(data.audioLevel), supported:true, access:data.access === true, state:states.includes(data.state) ? data.state : 'idle', title:text('title'), artist:text('artist'), album:text('album'), source:text('source'), artwork:typeof data.artwork === 'string' && data.artwork.length < 65000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.artwork) ? data.artwork : null, positionMs:time('positionMs'), durationMs:time('durationMs'), observedAt:time('observedAt') };
  }
  function parseStatus(data) {
    if (!data || data.version !== 1) throw Error("Unsupported device status");
    var audio = data.audio || {}, conn = data.connectivity || {}, display = data.display || {}, battery = data.battery || {};
    return {
      music: music(data.music),
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
    if (!response.ok) { var error = Error("Device provider unavailable"); error.status = response.status; throw error; }
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
        capsMusicLevelVersion = caps.musicLevelVersion === 1 ? 1 : 0;
        commands = caps.commands.filter(function (c) { return Object.prototype.hasOwnProperty.call(allowed, c); });
      }
      var data = await json("/api/device/v1/status", { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (myGeneration !== generation) return;
      snapshot = { available: true, status: parseStatus(data), commands: commands.slice(), musicLevelVersion: capsMusicLevelVersion };
    } catch (e) {
      if (myGeneration !== generation) return;
      token = null; commands = [];
      snapshot = { available: false, status: null, commands: [] };
    }
    if (myGeneration !== generation) return;
    controller = null; notify();
    if (listeners.size) timer = setTimeout(function () { poll(myGeneration); }, Math.min.apply(Math, [15000].concat(Array.from(intervals.values()))));
  }
  window.ThinkViewDevice = {
    subscribe: function (fn, options) {
      intervals.set(fn, options && Number.isFinite(options.intervalMs) ? Math.max(2000, Math.min(15000, options.intervalMs)) : 15000);
      listeners.add(fn); fn(snapshot);
      if (listeners.size === 1) { generation++; poll(generation); }
      return function () {
        listeners.delete(fn); intervals.delete(fn);
        if (!listeners.size) {
          generation++; clearTimeout(timer); timer = null;
          if (controller) controller.abort(); controller = null;
          token = null; commands = []; snapshot = { available: false, status: null, commands: [] };
        }
      };
    },
    musicLevel: async function (signal) {
      if (!token || capsMusicLevelVersion !== 1) throw Error("Audio intensity unavailable");
      var data = await json("/api/device/v1/music/level", { signal: signal, cache: "no-store", credentials: "same-origin" });
      var parsed = audioLevel(data);
      if (!parsed) throw Error("Invalid audio intensity response");
      return parsed;
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

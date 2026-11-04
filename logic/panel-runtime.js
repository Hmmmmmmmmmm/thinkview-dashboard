// Trusted, build-time panel packages. Capability declarations are review metadata, not isolation.
(function () {
  "use strict";
  var definitions = new Map(),
    running = new Map(),
    host = null,
    startupErrors = [];
  function storageFor(id) {
    return DashboardStorage.local(
      DashboardConfig.storagePrefix + "panel." + id + ".",
    );
  }
  function stop(id) {
    var cleanup = running.get(id);
    if (cleanup) {
      cleanup();
      running.delete(id);
    }
  }
  function sync() {
    if (!host) return [];
    var failures = [];
    definitions.forEach(function (def, id) {
      var root = document.querySelector('.board>[data-panel="' + id + '"]');
      if (!root || root.hidden) {
        stop(id);
        return;
      }
      if (running.has(id)) return;
      var layout =
        host.layout && host.layout.bind ? host.layout.bind(id) : null;
      var notificationIds = new Set(),
        alive = true,
        notificationSequence = 0;
      var cleanups = [], storage = storageFor(id), observers = new Set(), deviceInfo = {available:false, status:null, commands:[]}, deviceStop = null;
      function jsonCopy(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; } }
      function settingsSnapshot() {
        var supplied = host.panelSettings && host.panelSettings(id);
        var value = supplied === undefined ? storage.get("settings", {}) : supplied;
        return value && typeof value === "object" && !Array.isArray(value) ? jsonCopy(value) : {};
      }
      function dataSnapshot() { return {device_info:jsonCopy(deviceInfo), settings:settingsSnapshot()}; }
      function publishData() { observers.forEach(function (fn) { try { fn(dataSnapshot()); } catch (e) { console.error("Panel data listener failed:", id); } }); }
      function ensureDevice() {
        if (deviceStop || !host.deviceInfo || typeof host.deviceInfo.subscribe !== "function") return;
        deviceStop = host.deviceInfo.subscribe(function (value) { deviceInfo = value && typeof value === "object" ? jsonCopy(value) : {available:false,status:null,commands:[]}; publishData(); });
      }
      var scopedData = {
        get device_info() { ensureDevice(); return jsonCopy(deviceInfo); },
        get settings() { return settingsSnapshot(); },
        subscribe: function (fn) {
          if (typeof fn !== "function") throw Error("Panel data subscriber must be a function");
          ensureDevice(); observers.add(fn); fn(dataSnapshot());
          return function () { observers.delete(fn); };
        },
      };
      var scopedStorage = {
        get available() { return storage.available; },
        get: function (key, fallback) { return storage.get(key, fallback); },
        set: function (key, value) { var ok = storage.set(key, value); if (ok && key === "settings") { if (host.setPanelSettings) host.setPanelSettings(id, value); publishData(); } return ok; },
      };
      cleanups.push(function () { observers.clear(); if (typeof deviceStop === "function") deviceStop(); deviceStop = null; });
      var ctx = {
          root: root,
          host: host,
          manifest: def.manifest,
          layout: layout
            ? { emit: layout.emit }
            : {
                emit: function () {
                  return false;
                },
              },
          notifications: {
            publish: function (item) {
              if (!alive || !host.notifications) return false;
              var notificationId = host.notifications.publish(
                Object.assign({}, item, {
                  id:
                    "panel:" +
                    id +
                    ":" +
                    String((item && item.id) || ++notificationSequence),
                  panelId: id,
                  source: id,
                }),
              );
              notificationIds.add(notificationId);
              return notificationId;
            },
            dismiss: function (notificationId) {
              if (alive && notificationIds.has(notificationId)) {
                host.notifications.dismiss(notificationId);
                notificationIds.delete(notificationId);
              }
            },
          },
          storage: scopedStorage,
          data: scopedData,
          onCleanup: function (fn) {
            cleanups.push(fn);
          },
        };
      cleanups.push(function () {
        alive = false;
        notificationIds.forEach(function (key) {
          host.notifications.dismiss(key);
        });
        notificationIds.clear();
      });
      if (layout) cleanups.push(layout.dispose);
      try {
        var result = def.mount(ctx);
        if (typeof result === "function") cleanups.push(result);
        running.set(id, function () {
          cleanups.reverse().forEach(function (fn) {
            try {
              fn();
            } catch (e) {
              console.error("Panel cleanup failed:", id);
            }
          });
        });
      } catch (e) {
        cleanups.reverse().forEach(function (fn) {
          try {
            fn();
          } catch (_) {}
        });
        failures.push(id);
        console.error("Panel could not mount:", id, e.message);
      }
    });
    return failures;
  }
  window.DisplayPanels = {
    register: function (manifest, mount) {
      if (definitions.has(manifest.id))
        throw Error("Duplicate panel ID: " + manifest.id);
      definitions.set(manifest.id, { manifest: manifest, mount: mount });
    },
    start: function (services) {
      host = services;
      startupErrors = sync();
    },
    startupErrors: function () {
      return startupErrors.slice();
    },
    sync: sync,
    refresh: function () {
      Array.from(running.keys()).forEach(stop);
      sync();
    },
    stop: stop,
    manifest: function () {
      return Array.from(definitions.values()).map(function (def) {
        return def.manifest;
      });
    },
  };
  window.addEventListener("pagehide", function () {
    Array.from(running.keys()).forEach(stop);
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) sync();
  });
})();

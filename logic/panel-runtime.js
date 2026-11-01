// Trusted, build-time panel packages. Capability declarations are review metadata, not isolation.
(function () {
  "use strict";
  var definitions = new Map(),
    running = new Map(),
    host = null;
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
    if (!host) return;
    definitions.forEach(function (def, id) {
      var root = document.querySelector('.board>[data-panel="' + id + '"]');
      if (!root || root.hidden) {
        stop(id);
        return;
      }
      if (running.has(id)) return;
      var cleanups = [],
        ctx = {
          root: root,
          host: host,
          manifest: def.manifest,
          storage: storageFor(id),
          onCleanup: function (fn) {
            cleanups.push(fn);
          },
        };
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
        console.error("Panel could not mount:", id, e.message);
      }
    });
  }
  window.DisplayPanels = {
    register: function (manifest, mount) {
      if (definitions.has(manifest.id))
        throw Error("Duplicate panel ID: " + manifest.id);
      definitions.set(manifest.id, { manifest: manifest, mount: mount });
    },
    start: function (services) {
      host = services;
      sync();
    },
    sync: sync,
    refresh: function () { Array.from(running.keys()).forEach(stop); sync(); },
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

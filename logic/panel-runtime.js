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
      var cleanups = [],
        ctx = {
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
          storage: storageFor(id),
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

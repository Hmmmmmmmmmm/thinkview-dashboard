(function () {
  "use strict";
  var builtin = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("/* BUILTIN_BASE64 */"), function (c) { return c.charCodeAt(0); })));
  var frame = document.getElementById("dashboard"), notice = document.getElementById("boot-error"), db, active, fallback, pending, watchdog;
  var config = builtin.config, avatar = builtin.avatar, namespace = config.storagePrefix;
  function transaction(mode, action) { return new Promise(function (resolve, reject) { var tx = db.transaction("release", mode), store = tx.objectStore("release"), result; try { result = action(store); } catch (e) { reject(e); return; } tx.oncomplete = function () { resolve(result && result.result); }; tx.onerror = tx.onabort = function () { reject(tx.error || Error("Update storage failed.")); }; }); }
  function get(key) { return transaction("readonly", function (s) { return s.get(key); }); }
  function put(key, value) { return transaction("readwrite", function (s) { return s.put(value, key); }); }
  function snapshot() { var data = {}; for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && key.indexOf(namespace) === 0) data[key] = localStorage.getItem(key); } return data; }
  function restore(data) { var keys = []; for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && key.indexOf(namespace) === 0) keys.push(key); } keys.forEach(function (key) { localStorage.removeItem(key); }); Object.keys(data).forEach(function (key) { localStorage.setItem(key, data[key]); }); }
  function launch(bundle) { active = bundle; frame.hidden = false; notice.hidden = true; frame.srcdoc = bundle.html; }
  function failPending(reason) { clearTimeout(watchdog); if (!pending) return; var old = pending; pending = null; try { restore(old.storage); } catch (e) { notice.textContent = "Update failed and storage could not be restored: " + e.message; notice.hidden = false; frame.hidden = true; return; } transaction("readwrite", function (store) { store.put(null, "pending"); store.put(null, "staged"); store.put(reason, "failure"); }).then(function () { launch(fallback || builtin.bundle); }, function () { launch(fallback || builtin.bundle); }); }
  function startUpdate(bundle) { var saved = snapshot(); pending = { bundle: bundle, storage: saved }; fallback = active || fallback || builtin.bundle; return put("pending", pending).then(function () { launch(bundle); watchdog = setTimeout(function () { failPending("Update did not start."); }, 15000); }, function (error) { pending = null; throw error; }); }
  function safeStartup() { try { var draft = JSON.parse(localStorage.getItem(namespace + "chat-draft") || '""'), focus = JSON.parse(localStorage.getItem(namespace + "panel.focus.state") || "null"); return !draft && !(focus && focus.endAt && focus.endAt > Date.now()); } catch (e) { return false; } }
  window.DashboardBootstrap = {
    config: config, avatar: avatar,
    version: function () { return active && active.version || builtin.bundle.version; },
    ready: function (version) { if (!active || version !== active.version) return; if (!pending) return; clearTimeout(watchdog); var accepted = pending; transaction("readwrite", function (store) { store.put(accepted.bundle, "active"); store.put(null, "pending"); store.put(null, "staged"); store.put(null, "failure"); }).then(function () { return null; }).then(function () { fallback = accepted.bundle; pending = null; }, function () { failPending("Could not save update."); }); },
    stage: function (bundle) { if (!db) return Promise.reject(Error("Persistent update storage is unavailable.")); return put("staged", bundle); },
    staged: function () { return db ? get("staged") : Promise.resolve(null); },
    failure: function () { return db ? get("failure") : Promise.resolve(null); },
    apply: function () { if (!db) return Promise.reject(Error("Persistent update storage is unavailable.")); return get("staged").then(function (bundle) { if (!bundle) throw Error("No verified update is ready."); return startUpdate(bundle); }); },
    reload: function () { launch(active || builtin.bundle); }
  };
  try {
    var open = indexedDB.open("thinkview-dashboard-updates-v1", 1);
    open.onupgradeneeded = function () { open.result.createObjectStore("release"); };
    open.onerror = function () { launch(builtin.bundle); };
    open.onsuccess = function () { db = open.result; Promise.all([get("active"), get("pending"), get("staged")]).then(function (values) {
      fallback = values[0] || builtin.bundle;
      if (values[1]) { pending = values[1]; failPending("The previous update did not finish."); }
      else if (values[2] && safeStartup()) { active = fallback; startUpdate(values[2]).catch(function () { launch(fallback); }); }
      else launch(fallback);
    }).catch(function () { launch(builtin.bundle); }); };
  } catch (e) { launch(builtin.bundle); }
})();

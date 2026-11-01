(function () {
  "use strict";
  var host = window.parent !== window && window.parent.DashboardBootstrap;
  var status = document.getElementById("update-status"), apply = document.getElementById("update-apply"), transfer = document.getElementById("data-transfer"), dataStatus = document.getElementById("data-status");
  var api = "https://api.github.com/repos/Hmmmmmmmmmm/thinkview-dashboard/releases/latest", assetName = "thinkview-dashboard-bundle.html";
  function version(value) { var match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(value || ""); return match && [Number(match[1]), Number(match[2]), Number(match[3] || 0)]; }
  function newer(a, b) { var x = version(a), y = version(b); if (!x || !y) return false; for (var i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; }
  function say(message) { status.textContent = message; }
  function rateLimited(response) {
    if (response.status !== 403 && response.status !== 429) return;
    var reset = Number(response.headers && response.headers.get("x-ratelimit-reset")) * 1000;
    var retry = Number(response.headers && response.headers.get("retry-after"));
    var until = Math.max(Date.now() + 5 * 60000, reset || 0, retry > 0 ? Date.now() + retry * 1000 : 0);
    try { localStorage.setItem(DashboardConfig.storagePrefix + "update-next-check", JSON.stringify(until)); } catch (e) {}
    throw Error("GitHub is rate-limited or unavailable; retry after " + new Date(until).toLocaleString());
  }
  function check() {
    try { var next = JSON.parse(localStorage.getItem(DashboardConfig.storagePrefix + "update-next-check") || "0"); if (typeof next === "number" && next > Date.now()) { say("GitHub update checks are paused until " + new Date(next).toLocaleString() + "."); return; } } catch (e) {}
    if (!host) { say("Updates require the ThinkView bootstrap page."); return; }
    if (!window.crypto || !crypto.subtle) { say("This browser cannot verify updates. The current dashboard remains available."); return; }
    say("Checking for a dashboard update…");
    fetch(api, { cache: "no-store", credentials: "omit" }).then(function (response) { if (!response.ok) { rateLimited(response); throw Error("GitHub returned " + response.status); } try { localStorage.setItem(DashboardConfig.storagePrefix + "update-last-check", JSON.stringify(Date.now())); } catch (e) {} return response.json(); }).then(function (release) {
      if (release.draft || release.prerelease || !version(release.tag_name)) throw Error("The latest release is not a stable version.");
      if (!newer(release.tag_name, DashboardVersion)) { say("Dashboard " + DashboardVersion + " is up to date."); return null; }
      var assets = (release.assets || []).filter(function (a) { return a.name === assetName && a.state === "uploaded"; });
      var asset = assets[0], expected = "https://github.com/Hmmmmmmmmmm/thinkview-dashboard/releases/download/" + encodeURIComponent(release.tag_name) + "/" + assetName;
      if (assets.length !== 1 || !asset || asset.browser_download_url !== expected || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "") || asset.size > 1000000 || asset.size < 1) throw Error("Release asset metadata is invalid.");
      var releaseVersion = version(release.tag_name).join(".");
      var contents = "https://api.github.com/repos/Hmmmmmmmmmm/thinkview-dashboard/contents/releases/" + releaseVersion + "/" + assetName + "?ref=" + encodeURIComponent(release.tag_name);
      return fetch(contents, { credentials: "omit", headers: { Accept: "application/vnd.github+json" } }).then(function (r) { if (!r.ok) { rateLimited(r); throw Error("Release content returned " + r.status); } return r.json(); }).then(function (data) {
        if (data.encoding !== "base64" || typeof data.content !== "string" || data.size !== asset.size || data.size > 1000000) throw Error("Release content metadata is invalid.");
        var binary = atob(data.content.replace(/\s/g, "")), bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
        if (bytes.byteLength !== asset.size) throw Error("Release size does not match.");
        return crypto.subtle.digest("SHA-256", bytes).then(function (hash) { var actual = Array.from(new Uint8Array(hash)).map(function (v) { return v.toString(16).padStart(2, "0"); }).join(""); if ("sha256:" + actual !== asset.digest) throw Error("Release checksum does not match."); return { version: version(release.tag_name).join("."), html: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }; });
      }).then(function (bundle) { return host.stage(bundle).then(function () { apply.disabled = false; say("Dashboard " + bundle.version + " is ready. Apply when your draft and focus timer are finished."); }); });
    }).catch(function (error) { say("Update unavailable: " + error.message + ". Current dashboard remains available."); });
  }
  function safeToReload() {
    if (document.getElementById("message-input").value.trim()) return "Finish or copy your chat draft before continuing.";
    try { var raw = localStorage.getItem(DashboardConfig.storagePrefix + "panel.focus.state"), focus = raw && JSON.parse(raw); if (focus && focus.endAt && focus.endAt > Date.now()) return "Pause your focus timer before continuing."; } catch (e) { return "Could not verify the focus timer. Try again after storage is available."; }
    return "";
  }
  document.getElementById("update-check").onclick = check;
  apply.onclick = function () { var reason = safeToReload(); if (reason) { say(reason); return; } apply.disabled = true; say("Applying update…"); host.apply().catch(function (error) { apply.disabled = false; say("Could not apply update: " + error.message); }); };
  function dashboardData() { var result = {}; for (var i=0; i<localStorage.length; i++) { var key=localStorage.key(i); if (key && key.indexOf(DashboardConfig.storagePrefix) === 0) result[key.slice(DashboardConfig.storagePrefix.length)] = localStorage.getItem(key); } return result; }
  document.getElementById("data-export").onclick = function () { try { transfer.value = JSON.stringify({ format: "thinkview-dashboard-data-1", data: dashboardData() }, null, 2); dataStatus.textContent = "Export prepared. Copy the text to the other browser."; } catch (e) { dataStatus.textContent = "Export failed: " + e.message; } };
  document.getElementById("data-copy").onclick = function () { transfer.select(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(transfer.value).then(function () { dataStatus.textContent = "Copied."; }, function () { dataStatus.textContent = "Select and copy the text manually."; }); else dataStatus.textContent = "Select and copy the text manually."; };
  document.getElementById("data-import").onclick = function () {
    var reason = safeToReload(); if (reason) { dataStatus.textContent = reason; return; }
    try {
      if (transfer.value.length > 3000000) throw Error("Data is too large.");
      var payload = JSON.parse(transfer.value), data = payload.data;
      if (payload.format !== "thinkview-dashboard-data-1" || !data || typeof data !== "object" || Array.isArray(data)) throw Error("Not a dashboard data export.");
      var keys = Object.keys(data); if (keys.length > 1000 || keys.some(function (key) { if (!/^[A-Za-z0-9_.-]{1,160}$/.test(key) || typeof data[key] !== "string") return true; try { JSON.parse(data[key]); return false; } catch (e) { return true; } })) throw Error("Invalid dashboard data.");
      if (!window.confirm("Replace this browser's dashboard settings and panel data with the pasted export? Only import data you trust.")) return;
      // Flush mounted panels before replacing storage so unmount cannot overwrite imported data.
      DisplayPanels.manifest().forEach(function (manifest) { DisplayPanels.stop(manifest.id); });
      try {
        var old = dashboardData();
        try { Object.keys(old).forEach(function (key) { localStorage.removeItem(DashboardConfig.storagePrefix + key); }); keys.forEach(function (key) { localStorage.setItem(DashboardConfig.storagePrefix + key, data[key]); }); }
        catch (e) { Object.keys(data).forEach(function (key) { localStorage.removeItem(DashboardConfig.storagePrefix + key); }); Object.keys(old).forEach(function (key) { localStorage.setItem(DashboardConfig.storagePrefix + key, old[key]); }); throw e; }
      } catch (e) { DisplayPanels.sync(); throw e; }
      if (host) host.reload(); else window.location.reload();
    } catch (error) { dataStatus.textContent = "Import failed: " + error.message; }
  };
  var draftInput = document.getElementById("message-input"), draftStore = DashboardStorage.local(DashboardConfig.storagePrefix);
  var savedDraft = draftStore.get("chat-draft", ""); if (typeof savedDraft === "string" && savedDraft) { draftInput.value = savedDraft; draftInput.dispatchEvent(new Event("input", { bubbles: true })); }
  draftInput.addEventListener("input", function () { draftStore.set("chat-draft", draftInput.value); });
  if (host && DisplayPanels.startupErrors().length) { say("Some panels could not start: " + DisplayPanels.startupErrors().join(", ") + "."); }
  else if (host) { host.ready(DashboardVersion); host.staged().then(function (bundle) { if (bundle && newer(bundle.version, DashboardVersion)) { apply.disabled = false; say("Dashboard " + bundle.version + " is ready to apply."); } else host.failure().then(function (failure) { say(failure ? "Previous update failed; the last working dashboard was restored. " + failure : "Dashboard " + DashboardVersion + "."); }); }).catch(function () { say("Update storage unavailable."); }); var last = draftStore.get("update-last-check", 0); if (typeof last !== "number" || Date.now() - last >= 6 * 3600000) setTimeout(check, 10000); setInterval(check, 6 * 3600000); }
  else say("Dashboard " + DashboardVersion + "; automatic updates require the bootstrap page.");
})();

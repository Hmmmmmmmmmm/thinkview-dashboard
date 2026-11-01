var root = ctx.root, message = root.querySelector(".device-audio-message"), current = null, busy = false, disposed = false;
var provider = window.ThinkViewDevice;
function text(key, value) { var el = root.querySelector('[data-current="' + key + '"]'); if (el) el.textContent = value == null ? "Unavailable" : String(value); }
function supports(name) { return current && current.available && current.commands.indexOf(name) >= 0; }
function button(name, enabled, label) { var el = root.querySelector('[data-command="' + name + '"]'); if (el) { el.disabled = busy || !enabled || !supports(name); if (label) el.textContent = label; } }
function render(snapshot) { current = snapshot; if (!snapshot.available) { message.textContent = "Device controls unavailable in this browser."; root.querySelectorAll('button, input, select').forEach(function(el) { el.disabled = true; }); return; } message.textContent = busy ? "Requesting…" : ""; var s = snapshot.status;
["media", "notification"].forEach(function (key) { var x = s.audio[key], input = root.querySelector(key === "media" ? "#device-media" : "#device-notification"), name = "audio." + key; text(key, x ? x.value + " / " + x.max : null); input.disabled = busy || !x || !supports(name); if (x) { input.max = x.max; if (document.activeElement !== input) input.value = x.value; } button(name, !!x); });
}
function click(e) { var name = e.target.dataset.command; if (!name || !current || !current.available || busy) return; var s = current.status, v;
if (name === "audio.media" || name === "audio.notification") { var key = name.split(".")[1], level = s.audio[key], input = root.querySelector(key === "media" ? "#device-media" : "#device-notification"); if (level) v = Math.max(0, Math.min(level.max, Number(input.value))); }
 if (v === undefined) return; busy = true; render(current); provider.command(name, v).then(function () { if (!disposed) { busy = false; render(current); message.textContent = "Request sent; waiting for device status."; } }, function (err) { if (!disposed) { busy = false; render(current); message.textContent = err.message || "Request failed."; } });
}
root.addEventListener("click", click);
var unsubscribe = provider && provider.subscribe ? provider.subscribe(render) : null;
if (!unsubscribe) render({ available: false });
return function () { disposed = true; root.removeEventListener("click", click); if (unsubscribe) unsubscribe(); };

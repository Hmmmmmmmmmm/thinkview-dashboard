var root = ctx.root, message = root.querySelector(".device-status-message"), current = null, busy = false, disposed = false;
var provider = window.ThinkViewDevice;
function text(key, value) { var el = root.querySelector('[data-current="' + key + '"]'); if (el) el.textContent = value == null ? "Unavailable" : String(value); }
function supports(name) { return current && current.available && current.commands.indexOf(name) >= 0; }
function button(name, enabled, label) { var el = root.querySelector('[data-command="' + name + '"]'); if (el) { el.disabled = busy || !enabled || !supports(name); if (label) el.textContent = label; } }
function render(snapshot) { current = snapshot; root.dataset.online=String(snapshot.available); if (!snapshot.available) { message.textContent = "Device controls unavailable in this browser."; root.querySelectorAll('button, input, select').forEach(function(el) { el.disabled = true; }); return; } message.textContent = busy ? "Requesting…" : ""; var s = snapshot.status;
text("battery", s.battery.level === null ? null : s.battery.level + "%" + (s.battery.charging === null ? "" : s.battery.charging ? " · charging" : " · on battery")); ["network", "host", "engine", "appVersion"].forEach(function (key) { text(key, s[key]); });
}
function click(e) { var name = e.target.dataset.command; if (!name || !current || !current.available || busy) return; var s = current.status, v;

 if (v === undefined) return; busy = true; render(current); provider.command(name, v).then(function () { if (!disposed) { busy = false; render(current); message.textContent = "Request sent; waiting for device status."; } }, function (err) { if (!disposed) { busy = false; render(current); message.textContent = err.message || "Request failed."; } });
}
root.addEventListener("click", click);
var unsubscribe = provider && provider.subscribe ? provider.subscribe(render) : null;
if (!unsubscribe) render({ available: false });
return function () { disposed = true; root.removeEventListener("click", click); if (unsubscribe) unsubscribe(); };

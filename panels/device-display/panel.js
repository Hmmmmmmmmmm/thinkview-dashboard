var root = ctx.root, message = root.querySelector(".device-display-message"), current = null, busy = false, disposed = false;
var provider = window.ThinkViewDevice;
function text(key, value) { var el = root.querySelector('[data-current="' + key + '"]'); if (el) el.textContent = value == null ? "Unavailable" : String(value); }
function supports(name) { return current && current.available && current.commands.indexOf(name) >= 0; }
function button(name, enabled, label) { var el = root.querySelector('[data-command="' + name + '"]'); if (el) { el.disabled = busy || !enabled || !supports(name); if (label) el.textContent = label; } }
function render(snapshot) { current = snapshot; if (!snapshot.available) { message.textContent = "Device controls unavailable in this browser."; root.querySelectorAll('button, input, select').forEach(function(el) { el.disabled = true; }); return; } message.textContent = busy ? "Requesting…" : ""; var s = snapshot.status;
var d = s.display, brightness = root.querySelector("#device-brightness"), orientation = root.querySelector("#device-orientation"); text("brightness", d.brightness === null ? null : d.brightness === 0 ? "System" : d.brightness + "%"); text("keepAwake", d.keepAwake === null ? null : d.keepAwake ? "On" : "Off"); brightness.disabled = busy || !d.available || d.brightness === null || !supports("display.brightness"); orientation.disabled = busy || !d.available || d.orientation === null || !supports("display.orientation"); if (d.brightness !== null && document.activeElement !== brightness) brightness.value = d.brightness; if (d.orientation !== null && document.activeElement !== orientation) orientation.value = d.orientation; button("display.brightness", d.available && d.brightness !== null); button("display.orientation", d.available && d.orientation !== null); button("display.keepAwake", d.available && d.keepAwake !== null, d.keepAwake ? "Turn off" : "Turn on");
}
function click(e) { var name = e.target.dataset.command; if (!name || !current || !current.available || busy) return; var s = current.status, v;
if (name === "display.brightness") v = Number(root.querySelector("#device-brightness").value); else if (name === "display.orientation") v = root.querySelector("#device-orientation").value; else if (name === "display.keepAwake" && s.display.keepAwake !== null) v = !s.display.keepAwake;
 if (v === undefined) return; busy = true; render(current); provider.command(name, v).then(function () { if (!disposed) { busy = false; render(current); message.textContent = "Request sent; waiting for device status."; } }, function (err) { if (!disposed) { busy = false; render(current); message.textContent = err.message || "Request failed."; } });
}
root.addEventListener("click", click);
var unsubscribe = provider && provider.subscribe ? provider.subscribe(render) : null;
if (!unsubscribe) render({ available: false });
return function () { disposed = true; root.removeEventListener("click", click); if (unsubscribe) unsubscribe(); };

var root = ctx.root,
  provider = window.ThinkViewDevice,
  current = null,
  busy = false,
  disposed = false,
  debounce = null;
var message = root.querySelector(".device-audio-message");
var controls = ["media", "notification"].map(function (key) {
  return {
    key: key,
    input: root.querySelector(
      key === "media" ? "#device-media" : "#device-notification",
    ),
    label: root.querySelector('[data-current="' + key + '"]'),
    intent: root.querySelector('[data-intent="' + key + '"]'),
    draft: null,
    desired: null,
    pending: null,
    error: "",
    timeout: null,
  };
});
function level(c) {
  return (
    current &&
    current.available &&
    current.status &&
    current.status.audio &&
    current.status.audio[c.key]
  );
}
function supported(c) {
  return !!(
    level(c) &&
    current.commands &&
    current.commands.indexOf("audio." + c.key) >= 0
  );
}
function paint(c) {
  var actual = level(c),
    available = supported(c);
  c.input.disabled = !available;
  c.label.textContent = actual
    ? actual.value + " / " + actual.max
    : "Unavailable";
  if (actual) {
    c.input.max = actual.max;
    var shown =
      c.draft !== null
        ? c.draft
        : c.pending !== null
          ? c.pending
          : actual.value;
    c.input.value = Math.max(0, Math.min(actual.max, shown));
    c.input.style.setProperty(
      "--audio-level",
      (actual.max ? (100 * Number(c.input.value)) / actual.max : 0) + "%",
    );
    c.input.parentElement.style.setProperty(
      "--audio-level",
      (actual.max ? (100 * Number(c.input.value)) / actual.max : 0) + "%",
    );
    c.input.setAttribute(
      "aria-valuetext",
      String(c.input.value) +
        " of " +
        actual.max +
        (c.pending !== null
          ? " requested; device reports " + actual.value
          : ""),
    );
  }
  c.intent.textContent =
    c.error ||
    (c.pending !== null
      ? "Waiting for device: " + c.pending
      : c.draft !== null
        ? "Set to " + c.draft
        : "");
}
function render(snapshot) {
  if (disposed) return;
  current = snapshot;
  controls.forEach(function (c) {
    var actual = level(c);
    if (c.pending !== null && actual && actual.value === c.pending) {
      c.pending = null;
      clearTimeout(c.timeout);
      c.timeout = null;
    }
    if (!supported(c)) {
      c.desired = null;
      c.draft = null;
      c.pending = null;
      clearTimeout(c.timeout);
      c.timeout = null;
    }
    paint(c);
  });
  message.textContent = snapshot.available
    ? "Levels shown are reported by the device."
    : "Device controls unavailable in this browser.";
}
function flush() {
  if (disposed || busy) return;
  var c = controls.find(function (x) {
    return x.desired !== null;
  });
  if (!c) return;
  var value = c.desired;
  c.desired = null;
  if (!supported(c)) {
    c.draft = null;
    paint(c);
    flush();
    return;
  }
  value = Math.max(0, Math.min(level(c).max, Math.round(value)));
  if (level(c).value === value && c.pending === null) {
    c.draft = null;
    paint(c);
    flush();
    return;
  }
  c.pending = value;
  c.draft = null;
  c.error = "";
  clearTimeout(c.timeout);
  busy = true;
  paint(c);
  // A successful command response is not confirmation; only status readback is.
  Promise.resolve()
    .then(function () {
      if (disposed) return;
      return provider.command("audio." + c.key, value);
    })
    .then(
      function () {
        if (disposed) return;
        busy = false;
        if (c.pending !== null)
          c.timeout = setTimeout(function () {
            if (disposed) return;
            c.pending = null;
            c.error = "Device has not confirmed this level.";
            paint(c);
          }, 8000);
        paint(c);
        flush();
      },
      function (err) {
        if (disposed) return;
        busy = false;
        c.pending = null;
        c.error = err && err.message ? err.message : "Volume change failed.";
        paint(c);
        flush();
      },
    );
}
function preview(c) {
  if (!supported(c)) return;
  c.draft = Math.max(
    0,
    Math.min(level(c).max, Math.round(Number(c.input.value))),
  );
  c.error = "";
  paint(c);
}
controls.forEach(function (c) {
  c.onInput = function () {
    preview(c);
  };
  c.onChange = function () {
    if (!supported(c)) return;
    preview(c);
    c.desired = c.draft;
    clearTimeout(debounce);
    debounce = setTimeout(flush, 300);
  };
  c.input.addEventListener("input", c.onInput);
  c.input.addEventListener("change", c.onChange);
});
var unsubscribe =
  provider && provider.subscribe ? provider.subscribe(render) : null;
if (!unsubscribe) render({ available: false });
return function () {
  disposed = true;
  clearTimeout(debounce);
  controls.forEach(function (c) {
    clearTimeout(c.timeout);
    c.input.removeEventListener("input", c.onInput);
    c.input.removeEventListener("change", c.onChange);
  });
  if (unsubscribe) unsubscribe();
};

var root = ctx.root,
  state = ctx.storage.get("state", {
    duration: 25,
    remaining: 25 * 60000,
    endAt: null,
  }),
  time = root.querySelector(".focus-time"),
  toggle = root.querySelector("[data-action=toggle]");
if (
  !state ||
  [25, 50].indexOf(state.duration) < 0 ||
  typeof state.remaining !== "number" ||
  !isFinite(state.remaining) ||
  state.remaining < 0 ||
  state.remaining > 50 * 60000 ||
  !(
    state.endAt === null ||
    (typeof state.endAt === "number" && isFinite(state.endAt))
  )
)
  state = { duration: 25, remaining: 25 * 60000, endAt: null };
function save() {
  ctx.storage.set("state", state);
}
function remaining() {
  return state.endAt === null
    ? state.remaining
    : Math.max(0, state.endAt - Date.now());
}
function render() {
  var left = remaining();
  if (state.endAt !== null && left === 0) {
    state.endAt = null;
    state.remaining = 0;
    save();
    ctx.layout.emit("timerComplete");
    ctx.host.notifications.publish({
      id: "focus-complete",
      source: ctx.manifest.id,
      title: "Focus complete",
      message: "Your focus timer has finished.",
      priority: "medium",
    });
  }
  var seconds = Math.ceil(left / 1000);
  time.textContent =
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":\u200B" +
    String(seconds % 60).padStart(2, "0");
  toggle.textContent = state.endAt === null ? "Start" : "Pause";
  root.querySelectorAll("[data-duration]").forEach(function (button) {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.duration) === state.duration),
    );
  });
}
function switchTimer() {
  if (state.endAt !== null) {
    state.remaining = remaining();
    state.endAt = null;
    ctx.layout.emit("timerPause");
  } else {
    if (state.remaining <= 0) state.remaining = state.duration * 60000;
    state.endAt = Date.now() + state.remaining;
    ctx.layout.emit("timerRun");
  }
  save();
  render();
}
function reset() {
  ctx.layout.emit("timerStop");
  state.remaining = state.duration * 60000;
  state.endAt = null;
  save();
  render();
}
function preset(e) {
  state.duration = Number(e.currentTarget.dataset.duration);
  reset();
}
toggle.addEventListener("click", switchTimer);
root.querySelector("[data-action=reset]").addEventListener("click", reset);
root.querySelectorAll("[data-duration]").forEach(function (button) {
  button.addEventListener("click", preset);
});
render();
if (state.endAt !== null) ctx.layout.emit("timerRun");
var timer = setInterval(render, 1000);
return function () {
  clearInterval(timer);
  save();
  toggle.removeEventListener("click", switchTimer);
  root.querySelector("[data-action=reset]").removeEventListener("click", reset);
  root.querySelectorAll("[data-duration]").forEach(function (button) {
    button.removeEventListener("click", preset);
  });
};

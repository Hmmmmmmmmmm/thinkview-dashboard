const test = require("node:test");
const assert = require("node:assert/strict");
const { valid, create, gesture } = require("../logic/panel-expansion.js");
const { grid } = require("../logic/layout.js");
const fs = require("node:fs");
const vm = require("node:vm");
const manifest = () =>
  JSON.parse(fs.readFileSync("panels/focus/panel.json", "utf8"));
function setup() {
  const m = manifest(),
    saved = { focus: { columns: 1, rows: 1 } };
  let allowed = true,
    changes = 0;
  const model = create(
    [m],
    (id) => saved[id],
    () => allowed,
    () => changes++,
  );
  return {
    m,
    saved,
    model,
    block() {
      allowed = false;
    },
    get changes() {
      return changes;
    },
  };
}
test("all built-in manifests declare valid bounded ordered choices", () => {
  for (const id of JSON.parse(fs.readFileSync("panels/catalog.json")).panels)
    assert.equal(
      valid(JSON.parse(fs.readFileSync(`panels/${id}/panel.json`))),
      true,
      id,
    );
});
test("rejects invalid bounds, undeclared event sizes, duplicates and unknown fields", () => {
  for (const edit of [
    (m) => m.expansion.sizes.push({ columns: 3, rows: 1 }),
    (m) => m.expansion.sizes.push({ columns: 1, rows: 4 }),
    (m) => m.expansion.sizes.push({ columns: 1, rows: 1 }),
    (m) => (m.expansion.events.timerRun.size = { columns: 1, rows: 3 }),
    (m) => (m.expansion.events.timerPause.size = { columns: 1, rows: 1 }),
    (m) => (m.expansion.unknown = true),
    (m) => delete m.expansion.pinch,
  ]) {
    const m = manifest();
    edit(m);
    assert.equal(valid(m), false);
  }
});
test("ordered shape choices need not have ascending area", () => {
  const m = manifest();
  m.expansion.sizes = [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 2 },
    { columns: 1, rows: 3 },
  ];
  assert.equal(valid(m), true);
});
test("running expands, pause retains, stop restores unchanged saved geometry", () => {
  const { model, saved } = setup(),
    before = JSON.stringify(saved),
    panel = model.bind("focus");
  assert.equal(panel.emit("timerRun"), true);
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 2 });
  panel.emit("timerPause");
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 2 });
  panel.emit("timerStop");
  assert.deepEqual(model.effective("focus"), { columns: 1, rows: 1 });
  assert.equal(JSON.stringify(saved), before);
});
test("event restore reveals manual pre-expansion lease; manual override wins until removed", () => {
  const { model } = setup(),
    panel = model.bind("focus");
  model.step("focus", 1);
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 1 });
  panel.emit("timerRun");
  model.step("focus", 1);
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 3 });
  panel.emit("timerComplete");
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 3 });
  model.restore("focus");
  assert.deepEqual(model.effective("focus"), { columns: 1, rows: 1 });
});
test("duplicate timerRun is idempotent and does not steal a later manual override", () => {
  const { model } = setup(),
    p = model.bind("focus");
  p.emit("timerRun");
  model.step("focus", 1);
  p.emit("timerRun");
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 3 });
});
test("pinned/disabled requests rejected but stop and cleanup can always restore", () => {
  const s = setup(),
    p = s.model.bind("focus");
  p.emit("timerRun");
  s.block();
  assert.equal(s.model.step("focus", 1), false);
  assert.equal(p.emit("timerRun"), false);
  assert.equal(p.emit("timerStop"), true);
  assert.deepEqual(s.model.effective("focus"), { columns: 1, rows: 1 });
});
test("old source handles cannot emit after disposal or replacement; unknown events rejected", () => {
  const { model } = setup(),
    old = model.bind("focus");
  old.emit("timerRun");
  const now = model.bind("focus");
  assert.equal(old.emit("timerRun"), false);
  assert.equal(now.emit("constructor"), false);
  assert.equal(now.emit("unknown"), false);
  now.dispose();
  assert.equal(now.emit("timerRun"), false);
  assert.equal(model.active("focus"), false);
});
test("independent panels expand and restore without losing either span", () => {
  const a = manifest(),
    b = manifest();
  b.id = "notes";
  const m = create(
      [a, b],
      () => ({ columns: 1, rows: 1 }),
      () => true,
      () => {},
    ),
    pa = m.bind("focus"),
    pb = m.bind("notes");
  pa.emit("timerRun");
  pb.emit("timerRun");
  pa.emit("timerStop");
  assert.deepEqual(m.effective("focus"), { columns: 1, rows: 1 });
  assert.deepEqual(m.effective("notes"), { columns: 2, rows: 2 });
});
test("maximum span retains original grid units in both orientations and does not mutate input", () => {
  const sizes = {
      focus: { columns: 2, rows: 3 },
      notes: { columns: 1, rows: 1 },
    },
    copy = JSON.stringify(sizes);
  for (const landscape of [false, true]) {
    const p = grid(
      ["focus", "notes"],
      sizes,
      landscape,
      landscape ? 1280 : 800,
      landscape ? 800 : 1280,
      12,
    );
    assert.deepEqual(Object.keys(p.spans), ["focus", "notes"]);
    assert.deepEqual(p.spans.focus, { columns: 2, rows: 3 });
    assert.equal(p.columnWidth, landscape ? (1280 - 24) / 3 : (800 - 12) / 2);
  }
  assert.equal(JSON.stringify(sizes), copy);
});
test("two-finger spread/pinch commits a single step only at release", () => {
  const g = gesture();
  assert.equal(g.down("focus", 1, 0, 0), false);
  assert.equal(g.down("focus", 2, 100, 0), true);
  g.move(2, 130, 0);
  assert.deepEqual(g.up(2), { id: "focus", direction: 1 });
  assert.equal(g.active, false);
  g.down("focus", 1, 0, 0);
  g.down("focus", 2, 100, 0);
  g.move(2, 75, 0);
  assert.deepEqual(g.up(1), { id: "focus", direction: -1 });
});
test("pinch cancellation, third touch, cross-panel touch and jitter never commit", () => {
  const g = gesture();
  g.down("focus", 1, 0, 0);
  g.down("focus", 2, 100, 0);
  g.move(2, 140, 0);
  g.cancel();
  assert.equal(g.up(1), null);
  g.down("focus", 1, 0, 0);
  g.down("notes", 2, 100, 0);
  assert.equal(g.active, false);
  g.down("focus", 1, 0, 0);
  g.down("focus", 2, 100, 0);
  g.down("focus", 3, 200, 0);
  assert.equal(g.up(1), null);
  g.down("focus", 1, 0, 0);
  g.down("focus", 2, 100, 0);
  g.move(2, 110, 0);
  assert.deepEqual(g.up(1), { id: "focus", direction: 0 });
});
test("focus actual controls emit run, pause, stop and completion lifecycle events", () => {
  let now = 1000,
    tick;
  const events = [],
    nodes = new Map(),
    buttons = [25, 50].map((n) => ({
      dataset: { duration: String(n) },
      setAttribute() {},
      addEventListener() {},
      removeEventListener() {},
    }));
  function node(k) {
    if (!nodes.has(k))
      nodes.set(k, {
        handlers: {},
        textContent: "",
        addEventListener(n, f) {
          this.handlers[n] = f;
        },
        removeEventListener() {},
      });
    return nodes.get(k);
  }
  const ctx = {
    root: {
      querySelector: node,
      querySelectorAll() {
        return buttons;
      },
    },
    storage: {
      get(k, f) {
        return f;
      },
      set() {},
    },
    manifest: { id: "focus" },
    layout: {
      emit(n) {
        events.push(n);
      },
    },
    host: { notifications: { publish() {} } },
  };
  const context = {
    ctx,
    Date: {
      now() {
        return now;
      },
    },
    setInterval(f) {
      tick = f;
      return 1;
    },
    clearInterval() {},
    Number,
    String,
    Math,
    isFinite,
  };
  vm.runInNewContext(
    "(function(ctx){" +
      fs.readFileSync("panels/focus/panel.js", "utf8") +
      "})(ctx)",
    context,
  );
  node("[data-action=toggle]").handlers.click();
  node("[data-action=toggle]").handlers.click();
  node("[data-action=reset]").handlers.click();
  node("[data-action=toggle]").handlers.click();
  now += 25 * 60000;
  tick();
  assert.deepEqual(events, [
    "timerRun",
    "timerPause",
    "timerStop",
    "timerRun",
    "timerComplete",
  ]);
});
test("manual reduction refreshes older matching lease precedence over event expansion", () => {
  const { model } = setup();
  model.step("focus", 1);
  const p = model.bind("focus");
  p.emit("timerRun");
  assert.equal(model.step("focus", -1), true);
  assert.deepEqual(model.effective("focus"), { columns: 2, rows: 1 });
});
test("touch scrolling leaves cards fixed and moves only the outer canvas", () => {
  const { scrollPlan } = require("../logic/panel-expansion.js");
  assert.deepEqual(scrollPlan(50, 20, 200, 100), { inner: 0, outer: 150 });
  assert.deepEqual(scrollPlan(250, 20, 200, 100), { inner: 0, outer: 350 });
  assert.deepEqual(scrollPlan(-50, 20, 200, 100), { inner: 0, outer: 50 });
  assert.deepEqual(scrollPlan(50, 0, 0, 100), { inner: 0, outer: 150 });
});
test("actual pointer handlers move only the canvas, including swipes starting on buttons", () => {
  const source = fs.readFileSync("logic/app.js", "utf8");
  const start = source.indexOf(
    '  board.querySelectorAll("[data-panel]").forEach(function (panel) {\n    panel.addEventListener("pointerdown"',
  );
  const end = source.indexOf("  function finishPanelDrag(cancel)", start);
  assert.ok(start >= 0 && end > start);
  const handlers = {},
    panelHandlers = {};
  const panel = {
    scrollTop: 20,
    scrollHeight: 500,
    clientHeight: 200,
    parentElement: null,
    addEventListener(n, f) {
      panelHandlers[n] = f;
    },
    closest() {
      return null;
    },
  };
  const button = {
    parentElement: panel,
    scrollHeight: 48,
    clientHeight: 48,
    closest(selector) {
      return selector.includes("button") ? this : null;
    },
    hasAttribute() {
      return false;
    },
  };
  const board = {
    scrollTop: 100,
    querySelectorAll() {
      return {
        forEach(fn) {
          fn(panel);
        },
      };
    },
  };
  const context = {
    board,
    document: {
      addEventListener(n, f) {
        handlers[n] = f;
      },
    },
    panelDrag: null,
    panelCandidate: null,
    panelScroll: null,
    holdTimer: null,
    editingPanel: null,
    suppressClickUntil: 0,
    DashboardExpansion: require("../logic/panel-expansion.js"),
    getComputedStyle() {
      return { overflowY: "visible" };
    },
    setTimeout() {
      return 1;
    },
    startPanelDrag() {},
    Date,
    Math,
  };
  context.cancelCandidate = () => {
    context.panelCandidate = null;
  };
  vm.runInNewContext(source.slice(start, end), context);
  panelHandlers.pointerdown({
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 100,
    target: button,
  });
  assert.equal(
    context.holdTimer,
    null,
    "button must not initiate longpress drag",
  );
  handlers.pointermove({
    pointerId: 1,
    clientX: 0,
    clientY: 50,
    preventDefault() {},
  });
  assert.equal(panel.scrollTop, 0);
  assert.equal(board.scrollTop, 150);
  handlers.pointermove({
    pointerId: 1,
    clientX: 0,
    clientY: -300,
    preventDefault() {},
  });
  assert.equal(panel.scrollTop, 0);
  assert.equal(board.scrollTop, 500);
  context.panelCandidate = null;
  panelHandlers.pointerdown({
    button: 0,
    pointerId: 2,
    clientX: 0,
    clientY: 100,
    target: {
      closest() {
        return { tagName: "TEXTAREA" };
      },
    },
  });
  assert.equal(
    context.panelCandidate,
    null,
    "editable native controls retain their gesture",
  );
});

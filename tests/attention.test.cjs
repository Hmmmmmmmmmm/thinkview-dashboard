const test = require("node:test");
const assert = require("node:assert/strict");
const attention = require("../logic/panel-attention.js");
const allowed = () => true;
test("renderer prioritizes high alarm over medium weather until dismissed", () => {
  const weather = { id: "weather", panelId: "weather", priority: "medium" };
  const alarm = { id: "alarm", panelId: "clock", priority: "high" };
  const entries = [weather, alarm];
  assert.equal(attention.select(entries, allowed), alarm);
  assert.equal(
    attention.select(
      entries.filter((e) => e !== alarm),
      allowed,
    ),
    weather,
  );
  assert.deepEqual(entries, [weather, alarm]);
});
test("equal priorities are FIFO, emergency preempts, low never expands", () => {
  const a = { panelId: "a", priority: "medium" },
    b = { panelId: "b", priority: "medium" },
    c = { panelId: "c", priority: "emergency" };
  assert.equal(attention.select([a, b], allowed), a);
  assert.equal(attention.select([a, b, c], allowed), c);
  assert.equal(
    attention.select([{ panelId: "a", priority: "low" }], allowed),
    null,
  );
  assert.equal(
    attention.select([a, b], (id) => id === "b"),
    b,
  );
});
test("temporary attention restores underlying manual/timer dimensions without mutation", () => {
  const manual = { columns: 1, rows: 1 },
    timer = { columns: 2, rows: 3 };
  assert.deepEqual(attention.size(manual, true), { columns: 2, rows: 2 });
  assert.deepEqual(attention.size(manual, false), { columns: 1, rows: 1 });
  assert.deepEqual(attention.size(timer, true), timer);
  assert.deepEqual(manual, { columns: 1, rows: 1 });
});

test("panel notification IDs are source-bound and unmount only dismisses owned entries", () => {
  const fs = require("node:fs"),
    vm = require("node:vm");
  const contexts = {},
    entries = new Map();
  const sandbox = {
    console,
    Map,
    Set,
    DashboardConfig: { storagePrefix: "test." },
    DashboardStorage: { local: () => ({}) },
    document: { querySelector: () => ({ hidden: false }) },
    window: { addEventListener() {} },
  };
  vm.runInNewContext(
    fs.readFileSync("logic/panel-runtime.js", "utf8"),
    sandbox,
  );
  const runtime = sandbox.window.DisplayPanels;
  for (const id of ["weather", "clock"])
    runtime.register({ id }, (ctx) => {
      contexts[id] = ctx;
    });
  runtime.start({
    notifications: {
      publish(item) {
        entries.set(item.id, item);
        return item.id;
      },
      dismiss(id) {
        entries.delete(id);
      },
    },
  });
  const a = contexts.weather.notifications.publish({
    id: "same",
    title: "Rain",
    priority: "medium",
  });
  const b = contexts.clock.notifications.publish({
    id: "same",
    title: "Alarm",
    priority: "high",
  });
  assert.notEqual(a, b);
  assert.equal(entries.size, 2);
  contexts.weather.notifications.dismiss(b);
  assert.equal(entries.size, 2);
  runtime.stop("weather");
  assert.equal(entries.size, 1);
  assert.equal(entries.get(b).panelId, "clock");
  assert.equal(
    contexts.weather.notifications.publish({ title: "Stale" }),
    false,
  );
});

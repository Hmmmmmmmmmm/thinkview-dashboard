const test = require("node:test");
const assert = require("node:assert/strict");
const { migrate, move, grid } = require("../logic/layout.js");

test("layout migration keeps order and converts legacy sizes to grid dimensions", () => {
  const saved = {
    order: ["removed", "weather", "clock", "clock"],
    pinned: ["weather", "removed"],
    sizes: { weather: "medium", removed: "big" },
    enabled: { clock: false },
  };
  assert.deepEqual(migrate(saved, ["clock", "weather", "notes"]), {
    order: ["weather", "clock", "notes"],
    pinned: ["weather"],
    sizes: { weather: { columns: 1, rows: 1 } },
    enabled: { clock: false },
  });
  assert.deepEqual(saved.sizes, { weather: "medium", removed: "big" });
});
test("migration preserves valid saved spans and rejects out-of-contract spans", () => {
  assert.deepEqual(
    migrate(
      {
        sizes: {
          clock: "big",
          weather: { columns: 2, rows: 3 },
          notes: { columns: 3, rows: 4 },
        },
      },
      ["clock", "weather", "notes"],
    ).sizes,
    { clock: { columns: 2, rows: 1 }, weather: { columns: 2, rows: 3 } },
  );
});
test("reordering keeps pinned positions and does not mutate input", () => {
  const order = ["clock", "weather", "dot", "notes"];
  assert.deepEqual(move(order, ["weather"], "clock", "notes"), [
    "dot",
    "weather",
    "notes",
    "clock",
  ]);
  assert.deepEqual(order, ["clock", "weather", "dot", "notes"]);
  assert.deepEqual(move(order, ["weather"], "clock", "weather"), order);
  assert.deepEqual(move(order, [], "clock", "missing"), order);
});
test("canvas uses orientation geometry independently of enabled panel count", () => {
  const ids = ["clock", "weather", "dot", "calendar", "focus", "notes"];
  const portrait = grid(ids, {}, false, 800, 1280, 12),
    landscape = grid(ids, {}, true, 1280, 800, 12);
  assert.deepEqual([portrait.columns, portrait.rows], [2, 3]);
  assert.deepEqual([landscape.columns, landscape.rows], [3, 2]);
  assert.equal(portrait.columnWidth, 346);
  assert.equal(portrait.rowHeight, landscape.rowHeight);
  assert.equal(grid(ids.slice(0, 3), {}, false, 800, 1280, 12).columns, 2);
});
test("saved grid dimensions and manifest defaults supply spans without mutating storage", () => {
  const sizes = {
    clock: { columns: 2, rows: 1 },
    weather: { columns: 1, rows: 2 },
  };
  const plan = grid(["clock", "weather", "notes"], sizes, true, 1280, 800, 12, {
    notes: { columns: 2, rows: 3 },
  });
  assert.equal(plan.columns, 3);
  assert.equal(plan.rows, 2);
  assert.equal(plan.rowHeight, 346);
  assert.deepEqual(plan.spans, {
    clock: { columns: 2, rows: 1 },
    weather: { columns: 1, rows: 2 },
    notes: { columns: 2, rows: 3 },
  });
  assert.deepEqual(sizes, {
    clock: { columns: 2, rows: 1 },
    weather: { columns: 1, rows: 2 },
  });
});
test("invalid measurements never produce NaN CSS dimensions", () => {
  const plan = grid(["clock"], {}, false, NaN, NaN);
  assert.equal(Number.isFinite(plan.rowHeight), true);
  assert.ok(plan.rowHeight >= 1);
});

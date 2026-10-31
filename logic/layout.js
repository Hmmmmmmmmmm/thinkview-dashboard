(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DashboardLayout = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function migrate(saved, ids) {
    saved = saved && typeof saved === "object" ? saved : {};
    const order = Array.isArray(saved.order)
      ? saved.order.filter(
          (id, i, all) => ids.includes(id) && all.indexOf(id) === i,
        )
      : [];
    ids.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    const pinned = Array.isArray(saved.pinned)
      ? saved.pinned.filter(
          (id, i, all) => ids.includes(id) && all.indexOf(id) === i,
        )
      : [];
    const sizes = {},
      enabled = {};
    ids.forEach((id) => {
      if (saved.sizes && ["auto", "big", "medium"].includes(saved.sizes[id]))
        sizes[id] = saved.sizes[id];
      if (saved.enabled && typeof saved.enabled[id] === "boolean")
        enabled[id] = saved.enabled[id];
    });
    return { order, pinned, sizes, enabled };
  }
  function move(order, pinned, id, target) {
    if (
      id === target ||
      !order.includes(id) ||
      !order.includes(target) ||
      pinned.includes(id) ||
      pinned.includes(target)
    )
      return order.slice();
    const free = order.filter((key) => !pinned.includes(key)),
      destination = free.indexOf(target);
    free.splice(free.indexOf(id), 1);
    free.splice(destination, 0, id);
    let index = 0;
    return order.map((key) => (pinned.includes(key) ? key : free[index++]));
  }
  function grid(ids, sizes, landscape, available, gap) {
    const count = ids.length || 1,
      resized = ids.some((id) => ["big", "medium"].includes(sizes[id]));
    const columns = resized
      ? 2
      : landscape
        ? Math.min(3, count)
        : count > 3
          ? 2
          : 1;
    const rows = resized ? 3 : Math.ceil(count / columns);
    const height = Number.isFinite(available) ? available : 0,
      spacing = Number.isFinite(gap) ? gap : 0;
    const rowHeight = Math.max(
      resized ? 1 : 120,
      (height - spacing * (rows - 1)) / rows,
    );
    const spans = {};
    ids.forEach((id) => {
      spans[id] = !resized
        ? 1
        : sizes[id] === "big"
          ? 2
          : sizes[id] === "medium"
            ? 1
            : count <= 3 && !landscape
              ? 2
              : 1;
    });
    return { columns, rows, rowHeight, resized, spans };
  }
  return { migrate, move, grid };
});

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
      if (saved.sizes) {
        const size = saved.sizes[id];
        if (size === "big") sizes[id] = { columns: 2, rows: 1 };
        else if (size === "medium") sizes[id] = { columns: 1, rows: 1 };
        else if (size && Number.isInteger(size.columns) && Number.isInteger(size.rows) && size.columns >= 1 && size.columns <= 2 && size.rows >= 1 && size.rows <= 3)
          sizes[id] = { columns: size.columns, rows: size.rows };
      }
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
  function grid(ids, sizes, landscape, availableWidth, availableHeight, gap, defaults, rowGap) {
    const preferredColumns = landscape ? 3 : 2, preferredRows = landscape ? 2 : 3;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0 ||
        !Number.isFinite(availableHeight) || availableHeight <= 0) return null;
    const columnGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
    const verticalGap = Number.isFinite(rowGap) ? Math.max(0, rowGap) : columnGap;
    const columns = Math.max(1, Math.min(preferredColumns, Math.floor((availableWidth + columnGap) / (190 + columnGap))));
    const rows = Math.max(1, Math.min(preferredRows, Math.floor((availableHeight + verticalGap) / (152 + verticalGap))));
    const columnWidth = Math.max(0, (availableWidth - (columns - 1) * columnGap) / columns);
    const rowHeight = Math.max(1, (availableHeight - (rows - 1) * verticalGap) / rows);
    const spans = {};
    ids.forEach((id) => {
      const size = sizes[id] || (defaults && defaults[id]) || { columns: 1, rows: 1 };
      spans[id] = { columns: Math.min(columns, size.columns || 1), rows: size.rows || 1 };
    });
    return { columns, rows, rowHeight, columnWidth, resized: false, spans };
  }

  return { migrate, move, grid };
});

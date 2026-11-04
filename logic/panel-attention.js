(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DashboardAttention = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const priorities = ["emergency", "high", "medium", "low"];
  // Only named, declared views are eligible for automatic attention.
  function resolve(entry, manifest) {
    if (!entry || !entry.panelId || !entry.occurrenceId || !entry.layoutEvent ||
        !manifest || manifest.id !== entry.panelId) return null;
    const expansion = manifest.expansion || {};
    const event = expansion.events && expansion.events[entry.layoutEvent];
    const target = event && event.action === "expand" && event.size;
    if (!target || !Number.isInteger(target.columns) || !Number.isInteger(target.rows) ||
        target.columns < 1 || target.rows < 1 || !Array.isArray(expansion.sizes) ||
        !expansion.sizes.some((size) => size.columns === target.columns && size.rows === target.rows)) return null;
    return { columns: target.columns, rows: target.rows };
  }
  // Stable input order is FIFO among equals. No timers, persistence or panel policy.
  function select(entries, eligible) {
    return (
      entries
        .filter(
          (e) =>
            priorities.indexOf(e.priority) >= 0 &&
            e.priority !== "low" &&
            e.panelId &&
            eligible(e.panelId),
        )
        .sort(
          (a, b) =>
            priorities.indexOf(a.priority) - priorities.indexOf(b.priority),
        )[0] || null
    );
  }
  function size(base, target) {
    if (target && Number.isInteger(target.columns) && Number.isInteger(target.rows))
      return { columns: target.columns, rows: target.rows };
    return target ? { columns: Math.max(base.columns, 2), rows: Math.max(base.rows, 2) } : { ...base };
  }
  return { select, size, resolve };
});

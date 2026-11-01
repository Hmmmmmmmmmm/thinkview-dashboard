(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DashboardAttention = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const priorities = ["emergency", "high", "medium", "low"];
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
  function size(base, active) {
    return active
      ? { columns: Math.max(base.columns, 2), rows: Math.max(base.rows, 2) }
      : { ...base };
  }
  return { select, size };
});

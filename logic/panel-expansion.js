(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DashboardExpansion = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  const span = (v) =>
    object(v) &&
    Object.keys(v).length === 2 &&
    Number.isInteger(v.columns) &&
    v.columns >= 1 &&
    v.columns <= 2 &&
    Number.isInteger(v.rows) &&
    v.rows >= 1 &&
    v.rows <= 3;
  const equal = (a, b) => a.columns === b.columns && a.rows === b.rows;
  function valid(manifest) {
    if (!own(manifest, "expansion")) return true;
    const e = manifest.expansion;
    if (
      !object(e) ||
      Object.keys(e).some((k) => !["sizes", "pinch", "events"].includes(k)) ||
      !Array.isArray(e.sizes) ||
      !e.sizes.length ||
      e.sizes.length > 6 ||
      typeof e.pinch !== "boolean" ||
      !object(e.events)
    )
      return false;
    const seen = new Set();
    for (const s of e.sizes) {
      if (!span(s) || seen.has(s.columns + ":" + s.rows)) return false;
      seen.add(s.columns + ":" + s.rows);
    }
    if (
      !e.sizes.some((s) => equal(s, manifest.grid || { columns: 1, rows: 1 }))
    )
      return false;
    return Object.entries(e.events).every(
      ([name, r]) =>
        /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(name) &&
        object(r) &&
        ["expand", "retain", "restore"].includes(r.action) &&
        (r.action === "expand"
          ? Object.keys(r).length === 2 &&
            span(r.size) &&
            e.sizes.some((s) => equal(s, r.size))
          : Object.keys(r).length === 1),
    );
  }
  function create(manifests, getBase, permitted, changed) {
    const definitions = new Map(),
      leases = new Map(),
      generations = new Map();
    let sequence = 0;
    manifests.forEach((m) => {
      if (!valid(m)) throw Error("Invalid expansion: " + m.id);
      definitions.set(m.id, m);
    });
    function effective(id) {
      const entries = leases.get(id),
        winner =
          entries &&
          Array.from(entries.values()).sort(
            (a, b) => b.sequence - a.sequence,
          )[0];
      const m = definitions.get(id);
      const value = winner
        ? winner.size
        : getBase(id) || (m && m.grid) || { columns: 1, rows: 1 };
      return { columns: value.columns, rows: value.rows };
    }
    function remove(id, source) {
      const entries = leases.get(id);
      if (!entries) return false;
      const result = source ? entries.delete(source) : leases.delete(id);
      if (entries.size === 0) leases.delete(id);
      if (result) changed(id);
      return result;
    }
    function request(id, source, size) {
      const m = definitions.get(id);
      if (
        !m ||
        !m.expansion ||
        !permitted(id) ||
        !span(size) ||
        !m.expansion.sizes.some((s) => equal(s, size))
      )
        return false;
      let entries = leases.get(id);
      if (!entries) {
        entries = new Map();
        leases.set(id, entries);
      }
      const prior = entries.get(source);
      if (source === "event" && prior && equal(prior.size, size)) return true;
      entries.set(source, {
        size: { columns: size.columns, rows: size.rows },
        sequence: ++sequence,
      });
      changed(id);
      return true;
    }
    return {
      effective,
      active: (id) => leases.has(id),
      step(id, direction) {
        const m = definitions.get(id);
        if (
          !m ||
          !m.expansion ||
          ![-1, 1].includes(direction) ||
          !permitted(id)
        )
          return false;
        const choices = m.expansion.sizes,
          current = effective(id);
        let index = choices.findIndex((s) => equal(s, current));
        if (index < 0) {
          // A valid legacy/manual size may not occur in the package's expansion sequence.
          const area = current.columns * current.rows;
          index =
            direction > 0
              ? choices.findIndex((s) => s.columns * s.rows > area)
              : choices.map((s) => s.columns * s.rows < area).lastIndexOf(true);
        } else index += direction;
        if (index < 0 || index >= choices.length) return false;
        return request(id, "manual", choices[index]);
      },
      restore: (id) => remove(id),
      clear() {
        Array.from(leases.keys()).forEach((id) => remove(id));
      },
      bind(id) {
        const token = {};
        generations.set(id, token);
        return {
          emit(name) {
            if (generations.get(id) !== token) return false;
            const m = definitions.get(id),
              events = m && m.expansion && m.expansion.events;
            if (!events || typeof name !== "string" || !own(events, name))
              return false;
            const rule = events[name];
            if (rule.action === "retain") return true;
            if (rule.action === "restore") {
              remove(id, "event");
              return true;
            }
            return request(id, "event", rule.size);
          },
          dispose() {
            if (generations.get(id) === token) {
              generations.delete(id);
              remove(id, "event");
            }
          },
        };
      },
    };
  }
  // Pure two-point recognizer: layout changes happen only on a completed gesture.
  function gesture() {
    let points = new Map(),
      id = null,
      initial = 0,
      ratio = 1,
      active = false;
    const distance = () => {
      const p = Array.from(points.values());
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    };
    function cancel() {
      points.clear();
      id = null;
      initial = 0;
      ratio = 1;
      active = false;
    }
    return {
      get active() {
        return active;
      },
      down(panel, pointer, x, y) {
        if (id !== null && id !== panel) {
          cancel();
          return false;
        }
        if (points.size >= 2) {
          cancel();
          return false;
        }
        id = panel;
        points.set(pointer, { x, y });
        if (points.size === 2) {
          initial = distance();
          active = initial >= 20;
          ratio = 1;
          if (!active) cancel();
        }
        return active;
      },
      move(pointer, x, y) {
        if (!points.has(pointer)) return;
        points.set(pointer, { x, y });
        if (active) ratio = distance() / initial;
      },
      up(pointer) {
        if (!points.has(pointer)) return null;
        const result = active
          ? { id, direction: ratio >= 1.2 ? 1 : ratio <= 0.8 ? -1 : 0 }
          : null;
        cancel();
        return result;
      },
      cancel,
    };
  }
  function scrollPlan(delta, innerStart, innerMax, outerStart) {
    // Cards are bounded, paginated views. Swipes move only the outer canvas.
    return { inner: 0, outer: Math.max(0, outerStart + delta) };
  }
  return { valid, create, gesture, scrollPlan };
});

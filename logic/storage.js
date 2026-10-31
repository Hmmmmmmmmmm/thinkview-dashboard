(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DashboardStorage = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function create(storage, prefix) {
    let available = !!storage;
    return {
      get available() {
        return available;
      },
      get(key, fallback) {
        try {
          if (!storage) return fallback;
          const raw = storage.getItem(prefix + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (error) {
          available = false;
          return fallback;
        }
      },
      set(key, value) {
        try {
          if (!storage) return false;
          storage.setItem(prefix + key, JSON.stringify(value));
          return true;
        } catch (error) {
          available = false;
          return false;
        }
      },
    };
  }
  function local(prefix) {
    try {
      return create(globalThis.localStorage, prefix);
    } catch (error) {
      return create(null, prefix);
    }
  }
  return { create, local };
});

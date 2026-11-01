const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function setup(available = true) {
  let callback,
    disposed = false,
    now = 0,
    next = 0;
  const timers = new Map(),
    requests = [],
    nodes = {};
  function element(key) {
    return (
      nodes[key] ||
      (nodes[key] = {
        value: 0,
        max: 15,
        textContent: "",
        disabled: false,
        attrs: {},
        listeners: {},
        style: { setProperty() {} },
        parentElement: { style: { setProperty() {} } },
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        addEventListener(n, f) {
          this.listeners[n] = f;
        },
        removeEventListener(n) {
          delete this.listeners[n];
        },
      })
    );
  }
  const snapshot = (value = 3) => ({
    available,
    status: {
      audio: { media: { value, max: 15 }, notification: { value: 5, max: 15 } },
    },
    commands: ["audio.media", "audio.notification"],
  });
  const provider = {
    subscribe(fn) {
      callback = fn;
      fn(snapshot());
      return () => {
        disposed = true;
      };
    },
    command(name, value) {
      return new Promise((resolve, reject) =>
        requests.push({ name, value, resolve, reject }),
      );
    },
  };
  const context = {
    ctx: { root: { querySelector: element } },
    window: { ThinkViewDevice: provider },
    setTimeout(fn, delay) {
      timers.set(++next, { fn, at: now + delay });
      return next;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    Promise,
    Number,
    Math,
    String,
  };
  const cleanup = vm.runInNewContext(
    "(function(ctx){" +
      fs.readFileSync("panels/device-audio/panel.js", "utf8") +
      "})(ctx)",
    context,
  );
  async function advance(ms) {
    now += ms;
    for (const [id, t] of Array.from(timers))
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  function set(key, value, event) {
    const input = element(
      key === "media" ? "#device-media" : "#device-notification",
    );
    input.value = value;
    input.listeners[event]();
  }
  return {
    nodes,
    requests,
    advance,
    set,
    cleanup,
    status(v, max) {
      const value = snapshot(v);
      if (max !== undefined) value.status.audio.media.max = max;
      callback(value);
    },
    get disposed() {
      return disposed;
    },
  };
}
test("audio preview drag sends nothing; release and repeated keyboard changes coalesce", async () => {
  const s = setup();
  s.set("media", 6, "input");
  await s.advance(500);
  assert.equal(s.requests.length, 0);
  s.set("media", 7, "change");
  await s.advance(100);
  s.set("media", 8, "change");
  await s.advance(299);
  assert.equal(s.requests.length, 0);
  await s.advance(1);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].value, 8);
});
test("audio command acceptance never masquerades as confirmed status", async () => {
  const s = setup();
  s.set("media", 9, "change");
  await s.advance(300);
  s.requests[0].resolve();
  await s.advance(0);
  assert.equal(s.nodes['[data-current="media"]'].textContent, "3 / 15");
  assert.match(s.nodes['[data-intent="media"]'].textContent, /Waiting/);
  s.status(3);
  assert.equal(Number(s.nodes["#device-media"].value), 9);
  s.status(9);
  assert.equal(s.nodes['[data-current="media"]'].textContent, "9 / 15");
  assert.equal(s.nodes['[data-intent="media"]'].textContent, "");
});
test("audio serializes in-flight requests and sends only most recent queued level", async () => {
  const s = setup();
  s.set("media", 6, "change");
  await s.advance(300);
  s.set("media", 8, "change");
  await s.advance(300);
  s.set("media", 10, "change");
  await s.advance(300);
  assert.equal(s.requests.length, 1);
  s.requests[0].resolve();
  await s.advance(0);
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[1].value, 10);
});
test("audio failure and confirmation timeout restore reported level without false success", async () => {
  const s = setup();
  s.set("media", 8, "change");
  await s.advance(300);
  s.requests[0].reject(Error("Permission denied"));
  await s.advance(0);
  assert.match(
    s.nodes['[data-intent="media"]'].textContent,
    /Permission denied/,
  );
  assert.equal(Number(s.nodes["#device-media"].value), 3);
  s.set("media", 9, "change");
  await s.advance(300);
  s.requests[1].resolve();
  await s.advance(0);
  await s.advance(8000);
  assert.match(s.nodes['[data-intent="media"]'].textContent, /not confirmed/);
  assert.equal(Number(s.nodes["#device-media"].value), 3);
});
test("audio disconnected and unmounted controls cannot send commands", async () => {
  const s = setup(false);
  assert.equal(s.nodes["#device-media"].disabled, true);
  s.set("media", 6, "change");
  await s.advance(1000);
  assert.equal(s.requests.length, 0);
  const mounted = setup();
  mounted.set("media", 7, "change");
  mounted.cleanup();
  await mounted.advance(1000);
  assert.equal(mounted.requests.length, 0);
  assert.equal(mounted.disposed, true);
});
test("queued audio target is bounded by latest device maximum at dispatch", async () => {
  const s = setup();
  s.set("media", 12, "change");
  s.status(3, 7);
  await s.advance(300);
  assert.equal(s.requests[0].value, 7);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const API = require("../studio/data-api.js");
const body = (response) => response.json();
const request = (command, value) => ({
  method: "POST",
  headers: { "X-ThinkView-Token": "studio-fixture" },
  body: JSON.stringify({ command, value }),
});

test("Caiyun fixture diagnostics redact the credential", async () => {
  const fixture = API.preset("backend");
  const entries = [];
  const api = API.create(fixture, { report: (entry) => entries.push(entry) });
  const response = await api.fetch("https://api.caiyunapp.com/v2.6/test-secret/114.17,22.32/weather");
  assert.equal(response.status, 404);
  assert.equal(JSON.stringify(entries).includes("test-secret"), false);
  assert.equal(JSON.stringify(await response.json()).includes("test-secret"), false);
});

test("device fixtures preserve response contracts, command modes, and status readback", async () => {
  const fixture = API.preset(),
    api = API.create(fixture);
  assert.equal(
    (await body(await api.fetch("/api/device/v1/capabilities"))).token,
    "studio-fixture",
  );
  assert.equal(
    (await body(await api.fetch("/api/device/v1/status"))).audio.media.value,
    5,
  );
  assert.equal(
    (
      await body(
        await api.fetch("/api/device/v1/commands", request("audio.media", 8)),
      )
    ).ok,
    true,
  );
  assert.equal(
    (await body(await api.fetch("/api/device/v1/status"))).audio.media.value,
    8,
  );
  assert.equal(
    fixture.device.status.audio.media.value,
    5,
    "caller fixture is not mutated",
  );
  assert.equal(
    (
      await api.fetch("/api/device/v1/commands", {
        ...request("audio.media", 1),
        headers: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (await api.fetch("/api/device/v1/commands", request("audio.media", 200)))
      .status,
    400,
  );
  const ack = API.create({ ...fixture, commandMode: "acknowledge" });
  assert.equal(
    (
      await body(
        await ack.fetch("/api/device/v1/commands", request("audio.media", 8)),
      )
    ).ok,
    true,
  );
  assert.equal(
    (await body(await ack.fetch("/api/device/v1/status"))).audio.media.value,
    5,
  );
  const reject = API.create(API.preset("rejected"));
  assert.equal(
    (
      await body(
        await reject.fetch(
          "/api/device/v1/commands",
          request("wifi.enabled", false),
        ),
      )
    ).ok,
    false,
  );
  await api.fetch(
    "/api/device/v1/commands",
    request("music.levelAccess", false),
  );
  assert.equal(
    (await body(await api.fetch("/api/device/v1/music/level"))).state,
    "disabled",
  );
});
test("custom routes match URL, method and query without leaking unmatched requests to the network", async () => {
  let network = 0;
  const recorded = [];
  const fixture = API.preset("backend");
  fixture.routes.push({
    method: "GET",
    url: "https://backend.example/readings",
    matchQuery: false,
    status: 201,
    headers: { "X-Test": "yes" },
    body: { value: 9 },
  });
  fixture.routes.unshift({
    method: "GET",
    url: "/api/device/v1/status",
    status: 500,
    body: { error: "test" },
  });
  const api = API.create(fixture, {
    fetch: () => {
      network++;
    },
    report: (row) => recorded.push(row),
  });
  const response = await api.fetch("https://backend.example/readings?at=now");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Test"), "yes");
  assert.deepEqual(await response.json(), { value: 9 });
  assert.equal((await api.fetch("/api/device/v1/status")).status, 500);
  assert.equal(
    (await api.fetch("/api/example/data?unexpected=yes")).status,
    404,
  );
  assert.equal(
    (await api.fetch("https://wrong.example/api/example/data")).status,
    404,
  );
  assert.equal((await api.fetch("/api/device/v1/not-real/status")).status, 404);
  assert.equal(
    (await api.fetch("/api/example/data", { method: "POST" })).status,
    404,
  );
  assert.equal(network, 0);
  assert.equal(recorded.length, 6);
  assert.equal(recorded[0].response.value, 9);
  assert.equal(Object.hasOwn(recorded[0], "headers"), false);
});
test("latency, network failures, abort signals, no-content responses and Request input behave like fetch", async () => {
  const fixture = API.preset();
  fixture.routes = [
    {
      method: "GET",
      url: "/slow",
      status: 200,
      delayMs: 1000,
      body: { ok: true },
    },
    {
      method: "GET",
      url: "/fail",
      status: 200,
      error: "Fixture network failure",
    },
    {
      method: "POST",
      url: "https://backend.example/post",
      status: 204,
      body: { ignored: true },
    },
  ];
  const logs = [],
    api = API.create(fixture, { report: (r) => logs.push(r) }),
    controller = new AbortController();
  const pending = api.fetch("/slow", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(logs[0].aborted, true);
  await assert.rejects(api.fetch("/fail"), /Fixture network failure/);
  const response = await api.fetch(
    new Request("https://backend.example/post", {
      method: "POST",
      body: JSON.stringify({ hello: 1 }),
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.deepEqual(logs[2].request, { hello: 1 });
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    api.fetch("/api/device/v1/status", { signal: aborted.signal }),
    { name: "AbortError" },
  );
});
test("fresh and deliberately stale timestamps remain controllable; disabled fixtures preserve native fetch", async () => {
  const fresh = API.create(API.preset(), { now: () => 123456 });
  assert.equal(
    (await body(await fresh.fetch("/api/device/v1/music/level"))).measuredAt,
    123456,
  );
  assert.equal(
    (await body(await fresh.fetch("/api/device/v1/status"))).music.audioLevel
      .measuredAt,
    123456,
  );
  const fixture = API.preset();
  fixture.refreshTimestamps = false;
  fixture.device.level.measuredAt = 1;
  assert.equal(
    (await body(await API.create(fixture).fetch("/api/device/v1/music/level")))
      .measuredAt,
    1,
  );
  let called = 0;
  const native = API.create(API.preset("disabled"), {
    fetch: async (input) => {
      called++;
      return new Response(input);
    },
  });
  assert.equal(await (await native.fetch("native")).text(), "native");
  assert.equal(called, 1);
});
test("fixture validation rejects broken transport configuration but permits malformed response bodies for negative tests", () => {
  for (const change of [
    (f) => (f.delayMs = -1),
    (f) => (f.commandMode = "wrong"),
    (f) => (f.enabled = "yes"),
    (f) => (f.routes = [{ method: "GET", url: "//wrong", status: 200 }]),
    (f) => (f.routes = [{ method: "GET", url: "/x", status: 100 }]),
    (f) => (f.routes = [{ method: "GET", url: "/x", status: 200, unknown: 1 }]),
  ]) {
    const fixture = API.preset();
    change(fixture);
    assert.throws(() => API.validate(fixture));
  }
  const fixture = API.preset();
  fixture.device.status = { version: 999 };
  assert.deepEqual(API.validate(fixture).device.status, { version: 999 });
});
test("actual device provider uses fixture fetch, validates payloads, confirms commands, and aborts polling on unsubscribe", async () => {
  let timerId = 0;
  const timers = new Map(),
    requests = [];
  const fixture = API.preset(),
    api = API.create(fixture, { report: (r) => requests.push(r) });
  const context = {
    window: {},
    Set,
    Map,
    Array,
    Number,
    Object,
    Promise,
    AbortController,
    Date,
    console,
    fetch: api.fetch,
    setTimeout(fn, ms) {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  vm.runInNewContext(
    fs.readFileSync("logic/device-provider.js", "utf8"),
    context,
  );
  let status;
  const provider = context.window.ThinkViewDevice,
    unsubscribe = provider.subscribe((s) => (status = s));
  await new Promise((r) => setImmediate(r));
  assert.equal(status.available, true);
  assert.equal(status.status.music.title, "Fixture track");
  await provider.command("audio.media", 9);
  await new Promise((r) => setImmediate(r));
  assert.equal(status.status.audio.media.value, 9);
  assert.equal((await provider.musicLevel()).available, true);
  unsubscribe();
  assert.equal(timers.size, 0);
  assert.ok(
    requests.some(
      (r) => r.method === "POST" && r.request.command === "audio.media",
    ),
  );
  const invalid = API.preset();
  invalid.device.status.version = 9;
  const scope = { ...context, window: {}, fetch: API.create(invalid).fetch };
  vm.runInNewContext(
    fs.readFileSync("logic/device-provider.js", "utf8"),
    scope,
  );
  const stop = scope.window.ThinkViewDevice.subscribe((s) => (status = s));
  await new Promise((r) => setImmediate(r));
  assert.equal(status.available, false);
  stop();
});

test('separate device info and panel settings fixture documents are bounded and validated', () => {
 const fixture = API.preset('android');
 fixture.device_info = {available:true, status:{model:'synthetic'}};
 fixture.panel_settings = {weather:{city:'Hong Kong'},clock:{zones:['UTC']}};
 const validated = API.validate(fixture);
 assert.equal(validated.panel_settings.weather.city,'Hong Kong');
 assert.equal(validated.device_info.status.model,'synthetic');
 validated.panel_settings.weather.city='changed';
 assert.equal(fixture.panel_settings.weather.city,'Hong Kong');
 assert.throws(()=>API.validate({...fixture,panel_settings:{'../weather':{}}}));
 assert.throws(()=>API.validate({...fixture,device_info:[]}));
});

/* Deterministic, preview-only backend fixtures. Never installed in the dashboard. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanelDataAPI = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const object = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const commands = [
    "audio.media",
    "audio.notification",
    "wifi.enabled",
    "bluetooth.enabled",
    "display.brightness",
    "display.orientation",
    "display.keepAwake",
    "music.access",
    "music.levelAccess",
  ];
  function preset(name = "android") {
    const level = {
      enabled: true,
      available: true,
      state: "active",
      value: 0.65,
      unit: "normalized_peak",
      source: "android_output_mix_visualizer",
      measuredAt: 0,
      staleAfterMs: 1000,
    };
    const fixture = {
      version: 1,
      enabled: true,
      delayMs: 0,
      commandMode: "confirm",
      refreshTimestamps: true,
      device: {
        capabilities: {
          version: 1,
          token: "studio-fixture",
          commands: commands.slice(),
          musicLevelVersion: 1,
        },
        status: {
          version: 1,
          audio: {
            media: { value: 5, max: 15 },
            notification: { value: 4, max: 10 },
          },
          connectivity: {
            wifi: { enabled: true, state: "on" },
            bluetooth: { enabled: false, state: "off" },
          },
          display: {
            available: true,
            brightness: 60,
            orientation: "portrait",
            keepAwake: true,
          },
          battery: { level: 73, charging: false },
          network: "Fixture Wi-Fi",
          host: "Studio fixture",
          engine: "Simulated Android backend",
          appVersion: "fixture",
          music: {
            supported: true,
            access: true,
            state: "playing",
            title: "Fixture track",
            artist: "Test artist",
            album: "Test album",
            source: "Studio fixture",
            positionMs: 30000,
            durationMs: 180000,
            observedAt: 0,
            artwork: null,
            audioLevel: copy(level),
          },
        },
        level,
      },
      calendar: {
        status: "ready",
        message: "Studio test data",
        calendars: [
          { id: "fixture", summary: "Fixture calendar", primary: true },
        ],
        selected: ["fixture"],
        events: [],
      },
      routes: [],
    };
    if (name === "disabled") fixture.enabled = false;
    if (name === "permission") {
      fixture.device.status.music.access = false;
      Object.assign(fixture.device.status.music, {
        state: "idle",
        title: "",
        artist: "",
        album: "",
      });
      fixture.device.level = {
        enabled: false,
        available: false,
        state: "permission_required",
      };
      fixture.device.status.music.audioLevel = copy(fixture.device.level);
    }
    if (name === "unavailable")
      fixture.routes.push({
        method: "GET",
        url: "/api/device/v1/capabilities",
        status: 503,
        body: { error: "Fixture backend unavailable" },
      });
    if (name === "rejected") fixture.commandMode = "reject";
    if (name === "backend")
      fixture.routes.push({
        method: "GET",
        url: "/api/example/data",
        status: 200,
        body: { label: "Fixture reading", value: 42, unit: "%" },
      });
    return fixture;
  }
  function validate(value) {
    if (
      !object(value) ||
      value.version !== 1 ||
      typeof value.enabled !== "boolean"
    )
      throw Error("Fixture requires version: 1 and enabled: true/false");
    if (new TextEncoder().encode(JSON.stringify(value)).length > 512 * 1024)
      throw Error("Fixture exceeds 512 KiB");
    const keys = [
      "version",
      "enabled",
      "delayMs",
      "commandMode",
      "refreshTimestamps",
      "device",
      "calendar",
      "routes",
    ];
    if (Object.keys(value).some((key) => !keys.includes(key)))
      throw Error("Unknown fixture field");
    const delay = (v) =>
      v === undefined || (Number.isInteger(v) && v >= 0 && v <= 30000);
    if (!delay(value.delayMs))
      throw Error("delayMs must be an integer from 0 to 30000");
    if (
      value.commandMode !== undefined &&
      !["confirm", "acknowledge", "reject"].includes(value.commandMode)
    )
      throw Error("commandMode must be confirm, acknowledge, or reject");
    if (
      value.refreshTimestamps !== undefined &&
      typeof value.refreshTimestamps !== "boolean"
    )
      throw Error("refreshTimestamps must be boolean");
    if (
      value.device !== undefined &&
      (!object(value.device) ||
        Object.keys(value.device).some(
          (key) => !["capabilities", "status", "level"].includes(key),
        ))
    )
      throw Error("Invalid device fixture container");
    // Bodies intentionally remain arbitrary, so malformed backend responses can be tested.
    if (
      value.calendar !== undefined &&
      (!object(value.calendar) ||
        !["calendars", "selected", "events"].every((key) =>
          Array.isArray(value.calendar[key]),
        ) ||
        typeof value.calendar.status !== "string" ||
        typeof value.calendar.message !== "string")
    )
      throw Error(
        "Calendar needs status, message, calendars, selected, and events",
      );
    if (!Array.isArray(value.routes) || value.routes.length > 100)
      throw Error("routes must be an array of at most 100 responses");
    for (const route of value.routes) {
      if (
        !object(route) ||
        typeof route.url !== "string" ||
        !/^(\/(?!\/)|https?:\/\/)/.test(route.url) ||
        !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
          route.method,
        ) ||
        !Number.isInteger(route.status) ||
        route.status < 200 ||
        route.status > 599 ||
        !delay(route.delayMs) ||
        (route.error !== undefined && typeof route.error !== "string") ||
        (route.matchQuery !== undefined &&
          typeof route.matchQuery !== "boolean") ||
        Object.keys(route).some(
          (key) =>
            ![
              "method",
              "url",
              "status",
              "body",
              "delayMs",
              "error",
              "matchQuery",
              "headers",
            ].includes(key),
        )
      )
        throw Error(
          "Invalid route: use method, absolute URL or /path, HTTP status 200–599, body, optional delayMs/error/matchQuery/headers",
        );
      const url = new URL(route.url, "https://studio.invalid");
      if (url.username || url.password || url.hash)
        throw Error("Route URLs cannot contain credentials or fragments");
      if (
        route.headers !== undefined &&
        (!object(route.headers) ||
          Object.values(route.headers).some((v) => typeof v !== "string"))
      )
        throw Error("Route headers must be string values");
    }
    return copy(value);
  }
  function create(initial, options = {}) {
    let fixture = validate(initial),
      sequence = 0;
    const report = options.report || (() => {}),
      now = options.now || Date.now;
    const nativeFetch = options.fetch || globalThis.fetch.bind(globalThis);
    const clockSet = options.setTimeout || setTimeout,
      clockClear = options.clearTimeout || clearTimeout;
    async function wait(ms, signal) {
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      if (!ms) return;
      await new Promise((resolve, reject) => {
        const done = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const timer = clockSet(done, ms);
        const abort = () => {
          clockClear(timer);
          signal.removeEventListener("abort", abort);
          reject(new DOMException("Request aborted", "AbortError"));
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
    function responseBody(value, level = false) {
      const body = value === undefined ? null : copy(value);
      if (fixture.refreshTimestamps && object(body)) {
        if (level) body.measuredAt = now();
        else if (object(body.music)) {
          body.music.observedAt = now();
          if (
            object(body.music.audioLevel) &&
            body.music.audioLevel.state === "active"
          )
            body.music.audioLevel.measuredAt = now();
        }
      }
      return body;
    }
    function command(payload, headers) {
      const caps = fixture.device?.capabilities;
      if (!caps || headers.get("X-ThinkView-Token") !== caps.token)
        return {
          status: 403,
          body: { ok: false, error: "Fixture token rejected" },
        };
      if (
        !object(payload) ||
        !caps.commands?.includes(payload.command) ||
        !commands.includes(payload.command)
      )
        return {
          status: 400,
          body: { ok: false, error: "Unsupported fixture command" },
        };
      const { command: name, value } = payload;
      const valid = name.startsWith("audio.")
        ? Number.isInteger(value) && value >= 0
        : name === "display.brightness"
          ? Number.isInteger(value) && value >= 0 && value <= 100
          : name === "display.orientation"
            ? ["auto", "portrait", "landscape"].includes(value)
            : name === "music.access"
              ? value === true
              : typeof value === "boolean";
      if (!valid)
        return {
          status: 400,
          body: { ok: false, error: "Invalid fixture command value" },
        };
      if (fixture.commandMode === "reject")
        return {
          status: 200,
          body: { ok: false, error: "Command rejected by Studio fixture" },
        };
      if ((fixture.commandMode || "confirm") === "confirm") {
        const status = fixture.device.status;
        if (!object(status))
          return {
            status: 409,
            body: { ok: false, error: "No mutable fixture status" },
          };
        if (name.startsWith("audio.")) {
          const target = status.audio?.[name.split(".")[1]];
          if (!object(target) || value > target.max)
            return {
              status: 400,
              body: { ok: false, error: "Volume exceeds fixture maximum" },
            };
          target.value = value;
        } else if (["wifi.enabled", "bluetooth.enabled"].includes(name)) {
          const target = status.connectivity?.[name.split(".")[0]];
          if (object(target)) {
            target.enabled = value;
            target.state = value ? "on" : "off";
          }
        } else if (name.startsWith("display.") && object(status.display))
          status.display[name.split(".")[1]] = value;
        else if (name === "music.access" && object(status.music))
          status.music.access = value;
        else if (name === "music.levelAccess" && object(status.music)) {
          fixture.device.level = value
            ? {
                ...(object(fixture.device.level) ? fixture.device.level : {}),
                enabled: true,
                available: false,
                state: "waiting",
              }
            : { enabled: false, available: false, state: "disabled" };
          status.music.audioLevel = copy(fixture.device.level);
        }
      }
      return { status: 200, body: { ok: true } };
    }
    async function fetchFixture(input, init = {}) {
      const request =
        typeof Request !== "undefined" && input instanceof Request
          ? input
          : null;
      const url = new URL(
        request ? request.url : String(input),
        "https://studio.invalid",
      );
      const method = String(
          init.method || request?.method || "GET",
        ).toUpperCase(),
        signal = init.signal || request?.signal;
      if (!fixture.enabled) return nativeFetch(input, init);
      const entry = {
        id: ++sequence,
        method,
        url:
          url.origin === "https://studio.invalid"
            ? url.pathname + url.search
            : url.href,
        source: "fixture",
        status: null,
        request: null,
        response: null,
      };
      const started = now();
      try {
        let bodyText = init.body;
        if (
          bodyText === undefined &&
          request &&
          !["GET", "HEAD"].includes(method)
        )
          bodyText = await request.clone().text();
        if (bodyText !== undefined && bodyText !== null) {
          try {
            entry.request = JSON.parse(String(bodyText));
          } catch (_) {
            entry.request = String(bodyText);
          }
        }
        const route = fixture.routes.find((r) => {
          const target = new URL(r.url, "https://studio.invalid");
          return (
            r.method === method &&
            (r.url.startsWith("/")
              ? url.origin === "https://studio.invalid" &&
                target.pathname === url.pathname
              : target.origin === url.origin &&
                target.pathname === url.pathname) &&
            (r.matchQuery === false || target.search === url.search)
          );
        });
        const devicePath =
          url.origin === "https://studio.invalid" &&
          url.pathname.startsWith("/api/device/v1/");
        let response = route || {
          status: 404,
          body: {
            error: "No Studio fixture matches " + method + " " + entry.url,
          },
        };
        await wait(route?.delayMs ?? fixture.delayMs ?? 0, signal);
        if (signal?.aborted)
          throw new DOMException("Request aborted", "AbortError");
        if (route?.error) throw TypeError(route.error);
        if (!route && devicePath && fixture.device) {
          if (
            method === "GET" &&
            url.pathname === "/api/device/v1/capabilities"
          )
            response = { status: 200, body: fixture.device.capabilities };
          else if (method === "GET" && url.pathname === "/api/device/v1/status")
            response = {
              status: 200,
              body: responseBody(fixture.device.status),
            };
          else if (
            method === "GET" &&
            url.pathname === "/api/device/v1/music/level"
          )
            response = {
              status: 200,
              body: responseBody(fixture.device.level, true),
            };
          else if (
            method === "POST" &&
            url.pathname === "/api/device/v1/commands"
          )
            response = command(
              entry.request,
              new Headers(init.headers || request?.headers),
            );
        }
        const result = response.body === undefined ? null : copy(response.body);
        const noBody =
          method === "HEAD" || [204, 205, 304].includes(response.status);
        const headers = new Headers(response.headers || {});
        if (!headers.has("Content-Type"))
          headers.set("Content-Type", "application/json");
        const output = new Response(noBody ? null : JSON.stringify(result), {
          status: response.status,
          headers,
        });
        entry.status = output.status;
        entry.response = noBody ? null : result;
        entry.elapsedMs = now() - started;
        report(entry);
        return output;
      } catch (e) {
        entry.error = e.message;
        entry.aborted = e.name === "AbortError";
        entry.elapsedMs = now() - started;
        report(entry);
        throw e;
      }
    }
    return { fetch: fetchFixture, snapshot: () => copy(fixture) };
  }
  return { preset, validate, create };
});

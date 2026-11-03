# Panel Studio

Created 2026-11-03. A browser-local website for reading, creating, editing and debugging ThinkView panel packages. It uses the [v1 contract](PANEL-SPEC.md) and current source rather than a separate panel format.

## Build and open

From `dashboard/`:

```sh
npm run studio
```

Open `dist/studio/index.html` in current Chrome or Firefox. The generated website is one self-contained HTML file, works without a server, and makes no network requests of its own. Optional HTTP serving uses the existing `npm run serve` command at `http://127.0.0.1:8767/studio/`. Rebuild Studio after changes to the schema, host styles/tokens, shared runtime, examples or editor source. It never embeds `config.local.json`, `.local/`, account data or signing material.

## Edit a package

1. Open/drop a ZIP containing `panel.json` at its root or in a wrapper folder, or create a panel. If several package roots are found, choose a title and manifest path; cancel keeps the current workspace. Nested ZIP collections must be extracted first. The example selector includes every current catalog package from the checked-in source. External/device data is unavailable until supplied through explicitly enabled Data API fixtures.
2. Select files in the explorer. Edit raw UTF-8 source, use common Manifest fields, or add asset files with **+**. Added assets go under `assets/` and are declared automatically; manifest asset declarations may also name directories, including nested files; reference them with `asset:assets/name.ext` in HTML/CSS. Raster assets have an image preview; binary data are preserved byte-for-byte. Removing a file requires updating the manifest declaration too.
3. Check validation diagnostics. Checks cover the current schema, expansion membership, required files, paths, CSS scope, asset references, inline handlers, duplicate quoted HTML IDs and JavaScript syntax. Run the repository builder for final package acceptance: Studio validation is an authoring aid, not a replacement for full dashboard/global-ID and device tests.
4. Press **Run preview** or Ctrl/⌘+Enter. Opening a ZIP and restoring a draft never executes package scripts. Source changes require another run; size/theme changes apply immediately.
5. Export ZIP to retain the declared editable files, or dashboard JSON for the current dashboard Settings importer. Source ZIPs are limited to 256 members and 16 MiB compressed/expanded content; encrypted, multi-disk, ZIP64, unsafe/duplicate paths and corrupt checksums are rejected. ZIP export uses the interoperable stored method; imports also support deflate. JSON export embeds assets and enforces the dashboard's 2 MiB limit. A built-in panel ID cannot be imported over the dashboard's existing built-in package; custom panels need their own stable ID and matching CSS scope.

Drafts automatically save to `thinkview.panel-studio.draft.v1`, separate from dashboard preferences. This includes editable sources and panel-scoped preview storage. Browser quota or disabled storage produces a visible failure; export ZIP to preserve work. Browser clearing/private sessions may remove drafts. Studio edits memory and browser storage, not the imported original ZIP or source checkout.

## Preview and debug

The collapsible **Material 3 colors** reference at the bottom of the code pane displays the currently supported roles from `themes/material-tokens.json`: color swatches, role names, exact `--md-sys-color-*` CSS tokens and hex values. Search by name/token/hex, or click a swatch to copy `var(--md-sys-color-...)`. When clipboard access is unavailable, the selected variable remains in a copyable field. The four manifest `colorRole` tags show their paired container/text colors. The reference and preview share the Bright/Dark/Minimal selector; Minimal is the project's custom theme.

The four presets mean **columns × rows occupied by one panel**. Defaults use 260×220 CSS-pixel cells with 14px gaps: 1×1 = 260×220, 1×2 = 260×454, 2×1 = 534×220 and 2×2 = 534×454. Cell dimensions are editable, and the stage scrolls for larger panels. Temporary expansion events may request other contract-valid sizes, including 2×3; the preset stays the saved/base size. Themes use the actual generated dashboard tokens and shared styles.

- **Notifications:** Publish stable IDs, replace them, test all four priorities and choose list/toast/alert behavior per priority. Bound tests identify the current panel; unbound tests stay in the list. The priority sequence demonstrates emergency/high/medium ordering and low list-only behavior. Dismissal reveals the next eligible item. Activate calls a published `onActivate` callback. `ctx.notifications` automatically binds/owns its items and cleans them on unmount; direct `ctx.host.notifications` items require explicit cleanup, as in the dashboard. Pinning suppresses new expansion and attention eligibility.
- **Layout & state:** Emit only declared expansion events, restore base geometry, inspect effective dimensions and preview storage. No saved dashboard layout is changed.
- **Lifecycle:** Disable/enable or remount the current panel to exercise the actual runtime cleanup. Reset preview storage stops, clears only the current panel's preview data, then remounts. Rerunning replaces the sandbox and its session-only notifications. Durable preview storage survives runs and local draft recovery.
- **Console:** Capture panel console messages, mount/cleanup diagnostics, JavaScript exceptions, unhandled promises, blocked resource requests, notification operations and layout routing. Keep the most recent 300 entries and export JSON for debugging. Source strings inside the iframe carry `panel-<id>.js` as their source name.

## Supply backend test data

Open **Data API**, choose a preset, edit **Fixture JSON**, and press **Apply & rerun**. This remounts the preview with the new data and preserves panel storage. Source edits, fixture edits and the fixture enabled flag are saved with the local draft. Import/export data JSON separately from panel ZIP/JSON exports; backend test data never enters the installable package. A fixture document is limited to 512 KiB and 100 custom routes. Fixtures default to off, including in older drafts without fixture settings.

The Android ready preset provides `/api/device/v1/capabilities`, `/status`, `/commands` and `/music/level`. Studio embeds the actual `logic/device-provider.js`; panels use `window.ThinkViewDevice` unchanged, including its real parsing, polling, capability checks and command-readback behavior. Change `device.status` to supply audio, radio, brightness, battery, host or music values. Change `device.capabilities.commands` and `musicLevelVersion` to exercise older/limited backends. Deliberately malformed response bodies are allowed so the provider's failure handling can be tested.

- `commandMode: "confirm"` applies a supported command to the in-memory fixture; the provider then reads back the new status. `"acknowledge"` returns `{ "ok": true }` without changing status, which exercises waiting/timeouts. `"reject"` returns `{ "ok": false, "error": "..." }`. None of these sends a command to an Android device.
- `refreshTimestamps: true` refreshes the fixture music observation/measurement timestamps when responding. Set it to false and supply old timestamps to test stale data. These are synthetic values, not measurements. This option does not rewrite custom route bodies.
- `delayMs` applies 0–30000 ms latency; individual routes can override it. Abort signals cancel pending delayed responses. Requests are recorded after completion/error, with method, URL, request body, response body, HTTP status and elapsed time. Headers are omitted. The latest 80 records are retained for the current preview run.
- The `calendar` object provides the `DashboardCalendar` subscription state (`status`, `message`, `calendars`, `selected`, `events`) used by agenda/today/next panels. Event shapes follow the existing service: `{ id, calendarId, title, start: {dateTime}, end: {dateTime} }` or all-day `date` fields. Use future dates when testing current views. Connect/disconnect/selection are simulated; no OAuth token or sign-in is requested.

For another backend, add JSON response routes. For example, a panel containing `fetch("/api/example/data").then(r => r.json()).then(data => ...)` can use this minimal fixture:

```json
{
  "version": 1,
  "enabled": true,
  "routes": [
    {
      "method": "GET",
      "url": "/api/example/data",
      "status": 200,
      "delayMs": 150,
      "body": { "value": 42, "unit": "%" }
    }
  ]
}
```

Routes take precedence over the Android defaults. They match the exact method and URL/path/query; absolute HTTP(S) routes also match the origin, while relative `/path` routes apply only to relative/local requests. Set `matchQuery: false` to ignore variable query strings. Optional `headers` customize response headers; `body` is JSON, including JSON strings/primitives. Set `error` to a message to simulate a rejected network request, or `status` to an HTTP error such as 401, 429 or 503. Enabled fixtures return a synthetic 404 for unmatched fetches rather than using live network fallback. This works for cross-origin JSON API fixtures without enabling real network or CORS. Image/script loads, WebSockets and XMLHttpRequest are not mocked. With fixtures off, fetch uses its original behavior and the existing CSP/network toggle.

## Runtime boundaries

`tools/build_studio.py` embeds the current `schemas/panel.schema.json`, `logic/panel-runtime.js`, `panel-expansion.js`, `panel-attention.js`, `panel-fit.js`, `device-provider.js`, shared CSS and Material tokens, plus all current catalog packages. `studio/data-api.js` supplies only the preview's fixture transport; production provider/panel sources are unchanged. Source files live in `studio/`; generated output lives in ignored `dist/studio/` and is never edited manually.

Preview runs with `sandbox="allow-scripts"` and an opaque origin, without access to the editor DOM or browser credentials. Parent/frame messages are scoped to the current iframe and run token. Panel storage is bridged through `ctx.storage`; direct iframe localStorage is unavailable. CSP blocks network by default. **Allow declared network** applies on the next run and allows only manifest HTTPS origins for requests/images; servers still need appropriate CORS support for the opaque origin. Capability declarations do not grant microphone/location/native access. Arbitrary package code can still hang its own preview; review code before installing it in the trusted dashboard.

Notification presentation is a Studio harness using the real attention selection and expansion math. It does not wake Android, invoke OS notifications, schedule alarms or reproduce every dashboard action-card detail. Built-in clock/weather/Dot adapters report unavailable instead of inventing live data. Data API fixtures supply device/calendar/backend data for development; they do not establish real permissions, account connections or hardware support. Verify those behaviors in the actual host. Gesture arbitration, shell navigation, full screen, global-ID collisions and hardware permissions also require dashboard/device verification.

## Verification

`npm test` runs the normal dashboard checks plus Studio package/ZIP/schema/source-embedding tests. The builder compiles source and generated inline scripts to catch HTML script-boundary failures. Development validation used the installed Node/Python and headless desktop Chrome with a project-local profile. Browser smoke evidence, exported fixtures and screenshots are in the parent project's `.work/panel-studio/`; these are disposable verification files, not release assets.

Data API checks cover response matching, actual device-provider parsing, command modes and readback, fresh/stale timestamps, latency/abort, HTTP/network failures, malformed fixture configuration and disabled passthrough. Chrome checks exercised actual audio/connectivity/status/music/calendar panels, custom HTTPS response fixtures with real network blocked, invalid JSON, draft recovery and 800px/390px layouts. No production provider or device permissions were changed.

Validated: all four exact frame sizes, opaque-origin isolation, real starter and Focus/Notes/Calendar interaction, notifications and cleanup, priority ordering/replacement, pinning, themes, declared expansion/restore, compressed ZIP import and source round trip without execution, JSON installation through the actual dashboard importer, mount/network diagnostics, manifest edits, draft recovery, and 1280×800, 800×1280 and 390×844 layouts. Native Android services/permissions, arbitrary third-party panels, and Firefox are not certified by these checks. Studio remains an unreleased developer tool; no dashboard release or device update is performed by its build.

Wrapped-root selection and directory assets require browser verification across supported browsers; nested ZIP archives are not searched.

Studio and dashboard builds embed the shared `logic/panel-package.js` helper. Dashboard Settings accepts single-package ZIPs and folder asset declarations; select or export one package in Studio when a ZIP has multiple roots.

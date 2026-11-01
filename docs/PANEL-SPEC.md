# Panel package contract v1

A panel is a local, trusted package. Adding a panel requires a package directory and one catalog entry; no shell or layout code changes are required. `build.py` validates all packages and embeds their markup, styles, scripts, manifests and declared assets in the single deliverable `dist/index.html`.

## Package layout

```text
panels/
  catalog.json
  example/
    panel.json
    panel.html
    panel.css
    panel.js
    assets/             # optional; declare every bundled asset
```

`panels/catalog.json` controls registration and initial order:

```json
{
  "schemaVersion": 1,
  "panels": ["clock", "weather", "dot", "calendar", "focus", "notes", "example"]
}
```

Every package must have a stable lowercase ID, matching its folder name, and a semantic version. The machine-readable contract is `schemas/panel.schema.json`; the build also checks paths, selector scoping, duplicate IDs and JavaScript syntax.

```json
{
  "schemaVersion": 1,
  "id": "example",
  "title": "Example",
  "version": "1.0.0",
  "rootClass": "example-panel",
  "colorRole": "surface",
  "entries": {
    "html": "panel.html",
    "css": "panel.css",
    "js": "panel.js"
  },
  "capabilities": ["storage"],
  "assets": [],
  "defaultEnabled": true
}
```

`colorRole` is `primary`, `secondary`, `tertiary` or `surface`. The shell supplies paired Material You container/on-container colors. Minimal mode replaces panel fills with neutral tones and uses the yellow primary role for control outlines. Do not hard-code an independent panel palette.

The `type` field groups panels in Settings; `grid` supplies default `columns` and `rows` in grid units. Both fields are optional for older packages (Other and 1 × 1). Optional `description` is package documentation, not display text. Optional `networkOrigins` is required for the `network` capability and contains exact HTTPS origins, without paths, credentials or tokens. Supported capability labels are `local-time`, `storage`, `network`, `location`, `microphone`, `external-navigation` and `device-service`. The `device-service` label declares use of the optional same-origin ThinkView app service; it does not grant access by itself.

## Markup and styling

`panel.html` contains only the panel's content. The builder supplies the root `<section>`, accessible title, package ID, color role and the shared long-press controls. Do not create another outer panel, add inline event handlers, include a `<script>`, or reproduce shell controls.

Use `data-*` selectors within the package, queried through `ctx.root`. Prefer these to document-wide IDs. If an ID is necessary, prefix it with the package ID and ensure it is globally unique. The three original built-in panels retain stable IDs for compatibility.

Scope CSS to `[data-panel=example]` or package-prefixed classes such as `.example-value`. The build rejects selectors without that scope or prefix. Define the root as a size container and adapt content to both available width and height. A panel can occupy a narrow, shallow, wide or tall slot after resizing, dragging or rotation. Test Big, Medium and Auto fit in both orientations; hide optional secondary detail before clipping essential information. Controls need accessible names and a keyboard path. Avoid display annotations unless requested by the user.

Use shell tokens including `--ink`, `--muted`, `--accent`, `--line` and `--md-sys-color-*`. Package CSS may not use `@import`. Prefix keyframe names with the panel ID. Shared layout rules live in `web/styles/base.css`; color roles and mode overrides live in `web/styles/theme.css`. Declare local assets in `assets`, then reference them as `asset:assets/icon.svg`; the builder embeds them as data URLs. The resulting HTML must not depend on the package directory at runtime.

## Script lifecycle

`panel.js` is the body of a mount function, not an ES module. Do not add an outer `register()` call, imports or exports. The builder wraps and registers it with its manifest. It receives:

| Context                          | Meaning                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `ctx.root`                       | This package's root section. Query and update panel content here.            |
| `ctx.manifest`                   | Validated package metadata.                                                  |
| `ctx.storage.get(key, fallback)` | JSON-safe browser storage under this panel's namespace.                      |
| `ctx.storage.set(key, value)`    | Save a namespaced value; returns false when storage is unavailable.          |
| `ctx.onCleanup(fn)`              | Register cleanup for resources created by this mount.                        |
| `ctx.host`                       | Shared host services. Original built-ins use its clock/weather/Dot adapters. |

Example:

```js
var input = ctx.root.querySelector("[data-value]");
input.value = ctx.storage.get("value", "");
function save() {
  ctx.storage.set("value", input.value);
}
input.addEventListener("input", save);
return function () {
  input.removeEventListener("input", save);
};
```

The shared `ctx.host.notifications` API offers `publish({id, title, message, priority, source, onActivate})`, `dismiss(id)`, `list()`, and `subscribe(callback)`. Priorities are `emergency`, `high`, `medium` (default), and `low`. Publishing an existing ID replaces that item; subscriptions return an unsubscribe function. Use stable IDs for real events and clean up subscriptions. Users choose how each priority is presented in Settings; the list is session-only.

Mount runs when a panel is enabled. Return a cleanup function, use `onCleanup`, or both. Cleanup runs when the panel is disabled or the page leaves. Stop timers, abort requests and remove listeners. Re-enabling remounts the package. Keep durable user state in namespaced storage; do not rely on the DOM surviving a remount. Use wall-clock deadlines for timers, not a repeatedly decremented interval counter.

Do not request location or microphone access during mount. Require a deliberate user action. Fetch only declared destinations and handle timeouts, stale results, offline operation and missing storage. Do not render sample data as real account data. Do not include secrets in a package or its manifest.

Packages run in the page's JavaScript context. Capability declarations are review metadata, not a security sandbox or permission grant. Only install packages whose code has been reviewed and trusted.

## Layout behavior

The canvas has two columns and three visible row units in portrait, and three columns and two visible row units in landscape. Square grid units use the viewport short and long edges with equal fixed chrome allowance on both axes. A viewport whose dimensions swap on rotation therefore keeps the same unit size; smaller visible areas scroll. The same stored column and row spans apply in either orientation. Auto uses the manifest default; Medium is 1 × 1 and Big is 2 × 1. Additional rows scroll inside the canvas. Old Auto, Medium and Big choices migrate to these units. Pinned panels retain their order while other panels are reordered; rotation can reflow their physical grid cells. Hide/show panels in Settings. At least one panel must remain enabled.

Long-press reveals the corner menu and starts drag preparation. Moving after the hold drags the panel; releasing without moving leaves its menu open. A normal tap does not show editing controls. Keyboard users can focus a panel and press Enter, then use the menu; the revealed grip also supports arrow-key reordering. Full screen hides global display controls; a panel menu offers Leave full screen.

## Build and package

From the repository root:

```sh
python3 tools/build.py --check
python3 tools/build.py
python3 tools/build.py --package calendar
```

The first command validates without writing the HTML. The second builds `dist/index.html`. The third builds the HTML and exports `dist/packages/calendar-1.0.0.zip`, reporting its SHA-256.

A portable ZIP contains `panel.json`, its three entry files and only declared assets, relative to the package root. It contains no checkout paths, caches, credentials or catalog. The exporter also writes a self-contained JSON package containing the manifest and embedded assets. In Settings, select this JSON to load a trusted panel without rebuilding; the dashboard displays declared capabilities and network origins before installing it. Installed packages persist in browser storage and can be removed there; panel-specific saved data remains. ZIP packages remain useful for source distribution and can be added to the catalog for a build. Import checks format and duplicate IDs, but executes trusted code in the dashboard page with full access; it is not a sandbox. Only load reviewed packages. Version updates must preserve IDs and state compatibility, or explicitly migrate old state.

## Acceptance checks

Before accepting a package:

1. Build validation and JavaScript syntax pass; package paths remain inside its directory and HTML IDs remain unique.
2. Both orientations and Big/Medium/Auto fit render without clipping essential content.
3. Enable, disable, remount, reload, drag, pin and resize preserve intended state without duplicate listeners or timers.
4. Bright, dark and minimal use the shared roles; minimal has neutral surfaces and outlined controls.
5. The exported ZIP contains exactly its declared files; the built HTML works without the source folders.

## Temporary expansion contract

An optional `expansion` object declares ordered `sizes` (one to six unique integer column/row pairs, each within 2 columns × 3 rows), `pinch` (boolean) and named `events`. The default `grid` must occur in `sizes`. Ordering is author-defined, including shape changes; it is not inferred by area. Existing packages without this object keep their prior behavior.

```json
{
  "expansion": {
    "sizes": [
      { "columns": 1, "rows": 1 },
      { "columns": 2, "rows": 1 },
      { "columns": 2, "rows": 2 },
      { "columns": 2, "rows": 3 }
    ],
    "pinch": true,
    "events": {
      "timerRun": { "action": "expand", "size": { "columns": 2, "rows": 2 } },
      "timerPause": { "action": "retain" },
      "timerStop": { "action": "restore" },
      "timerComplete": { "action": "restore" }
    }
  }
}
```

Packages emit only declared names using `ctx.layout.emit("timerRun")`. The bound source is their own mounted package; stale handles cannot issue events after cleanup or replacement. This is routing correctness, not a security sandbox for trusted JavaScript. Build validation, JSON schema and runtime import validation all enforce bounds and event shape; build/runtime additionally check default/event membership and ordered uniqueness.

Temporary requests never write saved layout or move/remove other panels. The host maintains separate event/manual requests per panel; the latest changed request wins. Duplicate identical event requests are idempotent. A restore event removes only the event request and reveals the prior manual request or saved/default size. Menu Restore removes both requests. Manual saved-size selection clears temporary requests before saving. Disabled panels release temporary requests; event cleanup invalidates its emitter. Pinned panels refuse new size changes with an explicit toast; Stop/cleanup can still restore. Multiple panels may expand independently.

The existing grid unit dimensions and orientation behavior remain: portrait two columns/three visible units, landscape three columns/two visible units. Each requested span remains bounded 2×3 in either orientation. CSS grid reflows later panels in stored order into additional scrollable rows; it is not a six-slot-only document. A 2×3 landscape panel extends beyond the two visible row units and remains reachable through scrolling. Restoration reuses unchanged saved spans/order, rather than overwriting a snapshot over subsequent intentional user edits.

Two touch pointers on noninteractive panel background step through the ordered sizes. A distance ratio >=1.2 expands one step, <=0.8 reduces one step, and intermediate movement does nothing. Commit occurs on release, not continuously. Pointer cancellation, blur, resize and page exit discard the gesture. Inputs/buttons/selects/links are excluded. Browser gesture arbitration may cancel touches; the existing keyboard-accessible panel menu therefore also exposes Expand temporarily, Reduce temporarily and Restore saved size. Actual GeckoView multi-touch behavior still requires device/browser validation.

Focus Start/Resume emits timerRun, Pause emits timerPause and retains the current request, and the visible Stop control resets the timer to its selected preset and emits timerStop. Completion emits timerComplete. A running timer remounted from its saved deadline requests expansion again; temporary layout requests themselves are session-only and are not added to durable storage. Stopping after an event expansion restores the pre-event manual size if one existed, otherwise the saved/default size.

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

Optional `description` is package documentation, not display text. Optional `networkOrigins` is required for the `network` capability and contains exact HTTPS origins, without paths, credentials or tokens. Supported capability labels are `local-time`, `storage`, `network`, `location`, `microphone` and `external-navigation`.

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

Mount runs when a panel is enabled. Return a cleanup function, use `onCleanup`, or both. Cleanup runs when the panel is disabled or the page leaves. Stop timers, abort requests and remove listeners. Re-enabling remounts the package. Keep durable user state in namespaced storage; do not rely on the DOM surviving a remount. Use wall-clock deadlines for timers, not a repeatedly decremented interval counter.

Do not request location or microphone access during mount. Require a deliberate user action. Fetch only declared destinations and handle timeouts, stale results, offline operation and missing storage. Do not render sample data as real account data. Do not include secrets in a package or its manifest.

Packages run in the page's JavaScript context. Capability declarations are review metadata, not a security sandbox or permission grant. Only install packages whose code has been reviewed and trusted.

## Layout behavior

Auto fit uses one portrait column for up to three panels, two portrait columns for more panels, and up to three landscape columns. Each panel adapts its internal content independently. With six default panels, portrait is two columns by three rows and landscape is three columns by two rows.

A selected Big/Medium preset switches the canvas to two columns with three visible row units. Big spans both columns; Medium spans one. Each row occupies one-third of the usable panel area, excluding gaps and display controls. Additional rows scroll inside the canvas. Pinned panels retain their order while other panels are reordered; resizing and rotation may reflow their physical grid cells. Hide/show panels in Settings. At least one panel must remain enabled.

Long-press reveals the corner menu and starts drag preparation. Moving after the hold drags the panel; releasing without moving leaves its menu open. A normal tap does not show editing controls. Keyboard users can focus a panel and press Enter, then use the menu; the revealed grip also supports arrow-key reordering. Full screen hides global display controls; a panel menu offers Leave full screen.

## Build and package

From the repository root:

```sh
python3 tools/build.py --check
python3 tools/build.py
python3 tools/build.py --package calendar
```

The first command validates without writing the HTML. The second builds `dist/index.html`. The third builds the HTML and exports `dist/packages/calendar-1.0.0.zip`, reporting its SHA-256.

A portable ZIP contains `panel.json`, its three entry files and only declared assets, relative to the package root. It contains no checkout paths, caches, credentials or catalog. Extract a reviewed ZIP into `panels/<id>/`, add its ID to the catalog, then build. Version updates must preserve IDs and state compatibility, or explicitly migrate old state.

## Acceptance checks

Before accepting a package:

1. Build validation and JavaScript syntax pass; package paths remain inside its directory and HTML IDs remain unique.
2. Both orientations and Big/Medium/Auto fit render without clipping essential content.
3. Enable, disable, remount, reload, drag, pin and resize preserve intended state without duplicate listeners or timers.
4. Bright, dark and minimal use the shared roles; minimal has neutral surfaces and outlined controls.
5. The exported ZIP contains exactly its declared files; the built HTML works without the source folders.

# ThinkView Dashboard

A modular, local-first dashboard for always-on touchscreen displays. It builds to one self-contained bootstrap HTML file. Core dashboard features run in a modern browser; optional device panels connect to the ThinkView app’s same-origin local service.

Included panels: 24-hour local clock, weather, companion shortcuts, local calendar, Google Calendar agenda/today/next-event views, focus timer and saved notes. The interface supports portrait and landscape, long-press drag and pin, Big/Medium size presets, full-screen mode, and bright/dark/minimal Material You colors. Minimal mode starts after 30 seconds idle, keeps the clock colon steady, and uses neutral surfaces with outlined controls.

## Run locally

Requires **Python 3.9+** and **Node.js 24+**. Checked-in theme tokens make dependency installation optional for a normal build.

```sh
python3 tools/build.py
python3 -m http.server 8767 --bind 127.0.0.1 --directory dist
```

Open [the local dashboard](http://127.0.0.1:8767/). `dist/index.html` embeds the dashboard and its local configuration; it can also be copied into a device-local static server. It loads the dashboard in a same-origin frame so verified updates can be stored in browser storage without a server-side update API. Weather and city search require network access. Device panels require the compatible ThinkView app and report when its local service or a capability is unavailable. Full-screen and wake-lock behavior depend on the browser.

## Source structure

```text
web/                 Page structure and shared presentation
  template.html
  styles/base.css
  styles/theme.css
logic/               Application controller, pure layout/storage logic, lifecycle
  app.js
  layout.js
  storage.js
  panel-runtime.js
panels/              Independently packaged widgets and their catalog
  catalog.json
  <id>/panel.json
  <id>/panel.html
  <id>/panel.css
  <id>/panel.js
themes/              Generated Material You color roles
schemas/             Panel manifest contract
tools/               Validator, HTML builder and package exporter
tests/               Layout, storage and build regression tests
```

Page markup belongs in `web/`; shared behavior belongs in `logic/`; a widget's markup, styles and lifecycle belong in its package. The controller coordinates settings, dialogs and the original clock/weather/companion host adapters. Layout migration, pinned reordering and grid calculations are independent of the DOM. Widget scripts mount when enabled and clean up when disabled or the page leaves.

Do not edit generated files in `dist/`.

## Optional device panels

The Audio, Connectivity, Display and Device Status panels are disabled by default. Enable them in Settings when running in a compatible ThinkView app. They use its same-origin `/api/device/v1/` service through ordinary browser requests and show unavailable controls where the service, permission or device capability is absent. Commands are issued only after a user action; displayed state comes from subsequent device status. An ordinary static web server does not provide this service. Imported panel packages run as trusted page code and can access the same service; install only packages you trust.

## Personal configuration

The public default uses a generic companion avatar, the generic ChatGPT Dots link, and Hong Kong as an explicitly marked preview weather location. It contains no account-specific companion URL, device identifiers or personal profile image.

Copy `config.example.json` to the ignored `config.local.json`, edit the companion name/URL/avatar and weather defaults, then build:

```sh
python3 tools/build.py --config config.local.json --output dist/private/index.html
```

Store private avatar files under the ignored `.local/` directory. Configuration may use an HTTPS companion link and a local avatar path within the checkout. Public and personalized builds remain separate under `dist/`.

The companion screen holds a local draft; copy it and open the configured service to send it. Call controls open that service, where a call starts through its own controls. Browser dictation starts only after a deliberate action. The dashboard cannot read the existing conversation or unread count through a supported bridge. Notes and timer state stay in browser storage under a configurable namespace.

Google Calendar views use read-only Google access. Configure a Google OAuth web client ID for the dashboard’s registered HTTPS or localhost origin; `file://` cannot sign in. The first connection loads Google Identity and requires a second Connect action to open sign-in. Access tokens stay in memory, expire, and require another user action to reconnect. Choose calendars in a calendar panel. The local month/week panel works without an account.

Settings includes searchable panel groups and per-priority notification behavior. Focus completion creates a real notification. Refresh panels reloads their data and views. Full-screen hides scrollbars while preserving scrolling.

## Add a panel

Create a package directory, add its ID to `panels/catalog.json`, and build. The shell discovers its title, color role and default visibility through its manifest; no shell code change is required.

See [the panel contract](docs/PANEL-SPEC.md), [the JSON Schema](schemas/panel.schema.json), and [the calendar package](panels/calendar) for a complete example.

```sh
python3 tools/build.py --check
python3 tools/build.py --package calendar
```

The exporter writes a ZIP and a self-contained JSON package in `dist/packages/`. Settings can load the JSON without a rebuild. The ZIP includes only the manifest, declared entries and declared assets. Package scripts run as trusted page code with full dashboard access; declared capabilities are review metadata, not security isolation. Install only packages you trust.

## Checks

```sh
npm test
```

The checks cover layout migration, pinned positions, responsive grid rules, storage isolation/failure, configuration validation, package path confinement, duplicate IDs and generated JavaScript syntax. Browser verification is also needed for visual changes, pointer gestures, permissions and full screen. The design has been exercised at 533×805, 800×1280, 805×533 and 1280×800 viewport sizes. The original personalized deployment was checked on an Android 8.1 display using Chrome 138; this is not a guarantee for older system WebViews or overnight hardware behavior.

## Color system

Colors are generated from a golden source using [Google's Material Color Utilities](https://github.com/material-foundation/material-color-utilities), Tonal Spot, the 2021 role specification and standard contrast. Panels use paired primary/secondary/tertiary/surface roles. Minimal mode is a custom always-on extension with neutral monochrome surfaces and golden outlined controls.

To regenerate the checked-in palette:

```sh
npm ci --ignore-scripts
npm run theme
npm run build
```

The generated values are in `themes/material-tokens.json`. The library is a development dependency and is not downloaded by the dashboard at runtime.

Weather and city search use [Open-Meteo](https://open-meteo.com/). Data are modeled conditions, not a separate station measurement. The dashboard labels cached results and retains provider attribution. The website contains no API keys or account connection backend.

## License

[MIT](LICENSE). Contributions should keep the module boundaries and panel package contract intact.

## Updates and moving browser data

The bootstrap checks the latest stable release of `Hmmmmmmmmmm/thinkview-dashboard` on startup at most once per six hours and periodically while open. A newer release is downloaded through GitHub’s Contents API and checked against the exact size and SHA-256 digest of its published `thinkview-dashboard-bundle.html` release asset. It is staged locally, then applied at the next safe startup. Settings also offers Check and Apply controls. A running focus timer or unsent chat draft delays application. After startup succeeds the new version becomes the last known good version; failed initialization restores the prior version and its dashboard storage snapshot. Offline or unavailable GitHub leaves the existing dashboard available. Rate-limited responses pause checks until the reported reset or a minimum backoff; no GitHub login or token is used. Browser storage and an HTTPS or localhost secure context are needed for updating.

The bootstrap retains its own build configuration and avatar independently of generic releases. Release code does not contain private configuration. Settings → Move dashboard data provides a copy/paste JSON export and import for moving layout, preferences, drafts, notes and panel data to a separate browser profile. Import replaces the target profile’s dashboard namespace after confirmation; it does not change the source browser or transfer account sessions. Exported data can include private notes and trusted imported panel code: share it carefully and only import exports you trust.

For a release, set `VERSION`, build the generic public bundle, copy the generated bundle under `releases/<version>/thinkview-dashboard-bundle.html` and commit it (the generated bundle is updated by the release procedure, not edited manually), tag that commit, and attach the identical bundle as a release asset. GitHub release metadata must include its SHA-256 digest. Also attach the generic standalone bootstrap and checksum file. Do not use `--config` for public artifacts. Generate assets with `python3 tools/build.py --release-dir ../.work/dashboard-release-v0.1`; compare the tracked bundle and release asset before publication. The public bootstrap starts with generic settings.

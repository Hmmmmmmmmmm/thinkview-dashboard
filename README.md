# ThinkView Dashboard

A modular, local-first dashboard for always-on touchscreen displays. It builds to one self-contained bootstrap HTML file. Core dashboard features run in a modern browser; optional device panels connect to the ThinkView app’s same-origin local service.

See [the update log](CHANGELOG.md) for version history and compatibility changes.

Included panels: 24-hour local clock, weather, companion shortcuts, local calendar, Google Calendar agenda/today/next-event views, focus timer, saved notes, now playing, audio, connectivity, display and device status. The interface supports portrait and landscape, long-press drag and pin, Big/Medium size presets, full-screen mode, and bright/dark/minimal Material You colors. Minimal mode starts after 30 seconds idle, keeps the clock colon steady, and uses neutral surfaces with outlined controls.

Panels use compact, container-responsive typography and do not scroll internally. Notes, event lists and short display controls use page buttons; editing and connection settings open outside the cards. The canvas can move between additional panel rows using swipes or the toolbar arrows. It measures the space below the toolbar and reduces grid columns/rows on small screens so the visible cards fit.

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
  styles/panel-fit.css
logic/               Application controller, pure layout/storage logic, lifecycle
  app.js
  layout.js
  storage.js
  panel-runtime.js
  panel-fit.js
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

## Panel Studio

Build the browser-local package editor with `npm run studio`, then open `dist/studio/index.html` directly in a current Chrome or Firefox. Alternatively, run `npm run serve` and visit `http://127.0.0.1:8767/studio/`. Studio is a separate developer website; it is not bundled into the always-on dashboard or installed on the device.

Open or drop a panel ZIP to inspect its manifest, source, and assets, including packages in wrapper folders; choose a package when multiple roots are present. Directory asset declarations include nested files; create a panel from the starter or open any current catalog package as an example. Edit HTML/CSS/JavaScript or common manifest fields, validate, then choose **Run preview**. Preview sizes are columns × rows: 1×1, 1×2, 2×1, and 2×2, with configurable cell dimensions and bright/dark/minimal themes. The notification console tests priorities, ID replacement, attention, pinning, presentation, activation and dismissal. Layout event controls, disable/remount, preview storage, errors and downloadable logs support debugging.

The **Data API** tab supplies editable backend fixtures: Android capabilities/status, music/intensity, command confirmation or rejection, calendar state, and custom JSON responses for `fetch()` routes. Choose a preset, edit its JSON, then **Apply & rerun**. The actual device provider handles simulated HTTP responses. Inspect request bodies, response bodies, status and timing; set latency, HTTP/network failures or stale timestamps for negative tests. Fixtures persist with the local draft and export separately from panel packages. They send no device commands or account requests; unmatched requests return 404 while fixtures are enabled.

ZIP export preserves declared editable source/assets; dashboard JSON embeds assets for Settings → Load a trusted panel package (2 MiB import limit). Drafts and panel preview state stay in a separate browser storage namespace. Imports and restored drafts never execute automatically. Preview runs the current dashboard runtime/expansion/attention/fit helpers in an opaque sandbox, with network blocked by default and an opt-in for declared HTTPS origins. Native services, account access, built-in host adapters and Android behavior still require dashboard/device verification. See [the Studio guide](docs/PANEL-STUDIO.md).

## Optional device panels

The Audio, Connectivity, Display and Device Status panels are disabled by default. Enable them in Settings when running in a compatible ThinkView app. They use its same-origin `/api/device/v1/` service through ordinary browser requests and show unavailable controls where the service, permission or device capability is absent. Commands are issued only after a user action; displayed state comes from subsequent device status. An ordinary static web server does not provide this service. Imported panel packages run as trusted page code and can access the same service; install only packages you trust.

Now playing is enabled by default. ThinkView app 0.9 supplies real active media-session title, artist, album, embedded artwork and progress when available. **Connect music** explains Android notification access and opens its system settings only after another explicit action. Android grants broad notification access; this app uses the component to query active media sessions and does not read or store notification contents. Without access, it can report audible audio without track details. Players that do not publish a media session (including some receivers) may provide no metadata. The optional output intensity meter displays a single normalized peak measured from the Android system output mix, not frequency bands. It requires a compatible app and a separate, explicit Android audio permission; the browser does not capture microphone audio. Use Disable output intensity to stop measurement independently of track information. When data are stale or unavailable the meter is hidden. Minimal mode and reduced-motion settings retain the latest valid static meter; the record animation pauses.

## Companion backend interface

`DashboardCompanion.create(transport)` accepts an optional platform-neutral adapter with asynchronous `capabilities(signal)`, `status(signal)` and `open(signal)` methods and an optional `dispose()` method. Capabilities return `{version:1, provider, capabilities:{open, authStatus, read, send, call}}`; status returns `{version:1, availability, view, auth:"unknown"}`; `open` resolves `{ok:true}` when the request is accepted. Only `open` is implemented; the other capability flags are reserved and are not acted on. The default adapter uses the optional same-origin `/api/companion/v1/` service and keeps its transport token private. Calls time out and are cancelled on disposal. A platform adapter owns account sessions and service integration; the dashboard neither holds credentials nor infers sign-in from an open view. No read, send, call or authentication-status behavior is implied by this interface.

See [the companion backend contract](docs/COMPANION-BACKEND.md) for response states, injection and current validation limits.

Open Dots requests the compatible backend to open its configured companion; without one, the standalone external link remains available. The editor stores a local draft, which must be copied and sent in the service. Opening the service does not send the draft or start a call.

## Personal configuration

The public default uses a generic companion avatar, the generic ChatGPT Dots link, and Hong Kong as an explicitly marked preview weather location. It contains no account-specific companion URL, device identifiers or personal profile image.

Copy `config.example.json` to the ignored `config.local.json`, edit the companion name/URL/avatar and weather defaults, then build:

```sh
python3 tools/build.py --config config.local.json --output dist/private/index.html
```

Store private avatar files under the ignored `.local/` directory. Configuration may use an HTTPS companion link and a local avatar path within the checkout. Public and personalized builds remain separate under `dist/`.

The companion screen holds a local draft; copy it and open the configured service to send it. Call controls open that service, where a call starts through its own controls. Browser dictation starts only after a deliberate action. The dashboard cannot read the existing conversation or unread count through a supported bridge. Notes and timer state stay in browser storage under a configurable namespace.

Google Calendar views use read-only Google access. Configure a Google OAuth web client ID for the dashboard’s registered HTTPS or localhost origin; `file://` cannot sign in. The first connection loads Google Identity and requires a second Connect action to open sign-in. Access tokens stay in memory, expire, and require another user action to reconnect. Choose calendars in a calendar panel. The local month/week panel works without an account.

Settings includes searchable panel groups and per-priority notification behavior. Focus completion creates a real notification. Refresh panels reloads their data and views. Full-screen hides global controls; canvas navigation remains available by swipe or a panel's long-press menu.

## Add a panel

Create a package directory, add its ID to `panels/catalog.json`, and build. The shell discovers its title, color role and default visibility through its manifest; no shell code change is required.

See [the panel contract](docs/PANEL-SPEC.md), [the JSON Schema](schemas/panel.schema.json), and [the calendar package](panels/calendar) for a complete example.

```sh
python3 tools/build.py --check
python3 tools/build.py --package calendar
```

The exporter writes a ZIP and a self-contained JSON package in `dist/packages/`. Settings can load the JSON or a single-package ZIP without a rebuild. The ZIP includes only the manifest, declared entries and declared assets. Package scripts run as trusted page code with full dashboard access; declared capabilities are review metadata, not security isolation. Install only packages you trust.

## Checks

```sh
npm test
```

The checks cover layout migration, pinned positions, responsive grid rules, storage isolation/failure, configuration validation, package path confinement, duplicate IDs and generated JavaScript syntax. Browser verification is also needed for visual changes, pointer gestures, permissions and full screen. The design has been exercised at 533×805, 800×1280, 805×533 and 1280×800 viewport sizes. The target runtime is the bundled GeckoView 159 shell on Android 8.1 / ARMv7; standalone Chrome and Firefox have been retired on the device. Version 0.2 was visually reviewed in cloud desktop Firefox 159, including responsive layouts and labelled fixtures. This is not Android GeckoView hardware certification or a guarantee for the separate old system WebView, microphone, IME, or overnight operation.

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

For a release, set `VERSION` and package versions, update `CHANGELOG.md`, build the generic public bundle, copy the generated bundle under `releases/<version>/thinkview-dashboard-bundle.html` and commit it (the generated bundle is updated by the release procedure, not edited manually). Tag that commit and create a draft GitHub release using the matching changelog entry. Attach the identical bundle, generic standalone bootstrap and `SHA256SUMS` before publishing it as the stable latest release. GitHub release asset metadata must include the bundle's SHA-256 digest. Do not use `--config` for public artifacts. Generate assets with `python3 tools/build.py --release-dir ../.work/dashboard-release-v0.3.2`; compare the tracked bundle and uploaded assets before publication. The public bootstrap starts with generic settings. The ThinkView app's native updater uses the public latest-release checksum link; its automatic checks run at most once per six hours while the foreground service runs, with a manual settings button available. This updates dashboard HTML, not the Android APK.

## Version 0.2 attention examples

Open with `?demo=attention` to enable labelled illustrative notification scenarios in Settings. Weather, Dot, Calendar, Reminder and Alarm examples use the actual renderer-owned priority queue and temporary panel expansion. Medium/high/emergency notifications may expand; low remains in the list. A high alarm example holds ahead of medium weather until dismissal. Saved panel dimensions are unchanged, and existing timer Run/Pause/Stop behavior is preserved. Real notification inputs are intentionally unconnected. Demo Snooze does not schedule an alarm and no native alarm/reminder service is implemented.

Audio sliders now commit on release or debounced keyboard change, without Apply. Device-reported values remain separate from pending requests; unavailable services stay disabled. See [the visual contract](docs/VISUAL-DESIGN.md) for test scope and limitations.

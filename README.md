# ThinkView Dashboard

A modular, local-first dashboard for always-on touchscreen displays. It builds to one self-contained HTML file and runs in a modern Chromium browser without a backend.

Included panels: 24-hour local clock, weather, companion shortcuts, calendar, focus timer and saved notes. The interface supports portrait and landscape, long-press drag and pin, Big/Medium size presets, full-screen mode, and bright/dark/minimal Material You colors. Minimal mode starts after 30 seconds idle, keeps the clock colon steady, and uses neutral surfaces with outlined controls.

## Run locally

Requires **Python 3.9+** and **Node.js 24+**. Checked-in theme tokens make dependency installation optional for a normal build.

```sh
python3 tools/build.py
python3 -m http.server 8767 --bind 127.0.0.1 --directory dist
```

Open [the local dashboard](http://127.0.0.1:8767/). `dist/index.html` embeds the styles, scripts, manifests and image assets; it can also be copied into a device-local static server. Weather and city search require network access. Full-screen and wake-lock behavior depend on the browser.

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

## Personal configuration

The public default uses a generic companion avatar, the generic ChatGPT Dots link, and Hong Kong as an explicitly marked preview weather location. It contains no account-specific companion URL, device identifiers or personal profile image.

Copy `config.example.json` to the ignored `config.local.json`, edit the companion name/URL/avatar and weather defaults, then build:

```sh
python3 tools/build.py --config config.local.json --output dist/private/index.html
```

Store private avatar files under the ignored `.local/` directory. Configuration may use an HTTPS companion link and a local avatar path within the checkout. Public and personalized builds remain separate under `dist/`.

The chat screen is a **local layout preview**. It does not synchronize a real ChatGPT conversation. Companion and call controls open the configured service; a call still starts through that service's own controls. Browser dictation is optional and starts only after a deliberate action. Calendar is a local month/week view, not an account calendar. Notes and timer state stay in browser storage under a configurable namespace.

## Add a panel

Create a package directory, add its ID to `panels/catalog.json`, and build. The shell discovers its title, color role and default visibility through its manifest; no shell code change is required.

See [the panel contract](docs/PANEL-SPEC.md), [the JSON Schema](schemas/panel.schema.json), and [the calendar package](panels/calendar) for a complete example.

```sh
python3 tools/build.py --check
python3 tools/build.py --package calendar
```

The package exporter writes `dist/packages/calendar-1.0.0.zip`. The ZIP includes only the manifest, declared entries and declared assets. Package scripts are trusted page code; declared capabilities are review metadata, not security isolation.

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

# Dashboard update log

Newest release first. Record user-visible changes, compatibility requirements and actual validation for each published version. Unreleased work belongs under Unreleased until publication. Dates use Asia/Shanghai unless marked otherwise.

## Unreleased

### Changes

- Dashboard Settings supports trusted single-package ZIP imports and recursive asset directories; compressed ZIPs require deflate-raw DecompressionStream. Converted packages retain the 2 MiB limit. No Android permissions changed (2026-11-03).
- Panel runtime JSON retains all declared asset files in optional `assetData`, including files not referenced by HTML or CSS. Legacy JSON remains supported; the complete converted package remains limited to 2 MiB.
- Added a collapsible Material 3 color design reference below the Studio editor (2026-11-03), showing current theme swatches, role names, CSS token names, hex values and supported manifest colorRole tags. Search and click-to-copy support CSS authoring; the reference follows the preview theme and uses the checked-in token data.
- Added an optional portable companion backend adapter for an explicit Open Dots handoff; drafts remain local and opening does not sign in, send a message or start a call.

- Studio ZIP import now supports wrapped package roots, selection among multiple manifests, and directory asset declarations; nested ZIP collections must first be extracted (2026-11-03).
- Added the separate browser-local Panel Studio developer website (2026-11-03): ZIP inspection/import/export, source and manifest editing, declared assets, draft recovery and dashboard JSON export.
- Added 1×1, 1×2, 2×1 and 2×2 panel previews, configurable cell dimensions, three dashboard themes, lifecycle/storage/layout-event debugging, and notification priority/replacement/presentation/activation/dismissal tools.
- Added Studio Data API fixtures (2026-11-03): editable Android capabilities/status/music, command readback/rejection, calendar state, and custom fetch response routes with latency, HTTP/network failures and request/response inspection. All catalog packages are available as examples. Test data persists with drafts and imports/exports separately from installable panels.
- Now playing shows an optional measured system-output peak intensity meter in place of decorative playback bars. Track metadata remains available for music or video sources when published by the native service; video is not embedded.
- Output intensity requires a separate explicit Android permission action and can be disabled independently of track information. Stale or unavailable readings are hidden, and minimal/reduced-motion modes keep the current static reading.

### Compatibility

- Native opening requires a compatible companion backend; standalone dashboards retain their external link and local draft.

- Studio is built with `npm run studio` and opens as a standalone HTML file in a current desktop browser. Compressed ZIP import requires `DecompressionStream('deflate-raw')`; no runtime dependencies or uploads are required. Preview is isolated with network blocked by default; device services, account connections and built-in host adapters require dashboard/device testing. Dashboard JSON export enforces the existing 2 MiB import limit. No Android permissions or APK changes are introduced by Studio.
- Enabled Data API fixtures intercept preview fetch requests, use the unchanged device provider, and return 404 for unmatched requests. They do not call Android or connect accounts. Fixtures default to off; the existing network policy applies when disabled. Calendar state is a simulated service; real native permissions, OAuth, WebSockets and XMLHttpRequest are not simulated.
- The intensity meter requires a ThinkView app exposing music level API version 1 and Android output-mix Visualizer support. Older apps retain track information but cannot provide intensity. The Android permission is separate from notification access; the dashboard does not record microphone audio.

### Validation

- Dashboard asset packages: independent checks passed 78 JavaScript tests, 8 Python tests and validation of 14 panels. Chrome assertions verified wrapped ZIP import through Settings, nested SVG loading and mount behavior after reload, exact stored unused asset bytes, Studio directory-asset JSON and legacy JSON compatibility, and rejection without persistence for multi-root and oversized converted ZIPs. The near-limit accepted boundary, Firefox and Android remain unverified; the captured dashboard screenshot does not show the imported panel in its viewport.
- Color reference: 72 JavaScript tests and 6 Python tests passed. Chrome checked all 35 token names/values in each theme, manifest tags, search/copy fallback, theme synchronization, collapse, and 1440×1000, 1280×800, 800×1280 and 390×844 layouts. Token data is embedded from the checked-in theme file; no theme generation or Android change was required.
- Companion adapter automated tests cover capability validation, unavailable backends, explicit open, cancellation and transport boundaries. Device-native sign-in and opening require separate verification.

- Data API update: the combined dashboard suite passed 72 JavaScript tests and 6 Python tests, including unchanged-provider integration, response matching, command confirmation/acknowledgement/rejection, timestamp handling, aborts and simulated failures. Desktop Chrome exercised actual audio/connectivity/status/music/calendar panels, custom HTTPS fixtures with real network blocked, JSON validation, fixture draft recovery, data import/export and portrait/narrow layouts. Fixture tests do not verify real Android permissions or backend/account connectivity.
- Folder ZIP import: independent browser verification passed nested SVG rendering, explicit Run behavior, exact ZIP bytes, embedded JSON assets, package selection and sibling exclusion. The combined suite passed 75 JavaScript tests, 6 Python tests and validation of 14 panels.
- Studio: the combined dashboard suite passed 59 JavaScript tests and 6 Python tests, including ZIP integrity/limits, compressed source packages, all 14 current manifests, source embedding and generated script syntax. Local headless Chrome passed package round trips, actual dashboard JSON installation, real Focus/Notes/Calendar interactions, notifications, pinning, cleanup, draft recovery, themes and desktop/portrait/narrow layouts. Android and Firefox Studio behavior remain unverified.
- Automated checks and package validation are recorded with the implementation. The local development dashboard was installed with the updated shell and receiver; its Now playing controls were visible. The user subsequently reported that live playback works. Sender coverage, individual metadata fields, output intensity behavior, permission revocation and overnight use remain unverified. This was not a public dashboard release.

## 0.3.2 — 2026-11-02

### Changes

- Reduced panel typography and made each package adapt to available width and height in portrait and landscape.
- Fit the grid to the measured canvas below the toolbar, reducing columns or visible rows on small screens. Saved layout spans, order and pins remain intact.
- Removed scrolling inside panels. Notes, calendar events and short Display controls use page buttons; editing and connection settings open outside the cards.
- Added canvas page arrows, plus menu navigation when global controls are hidden in full screen.
- Added Now playing with track title, artist, album, embedded artwork, progress, a rotating record and animated playback bars. Animations pause when playback stops, in minimal mode and with reduced motion.
- Added shared pagination/editor helpers and documented the fit and lifecycle rules for future packages.

### Compatibility

Core panels run in a modern browser. Track details require ThinkView app 0.9, a player publishing an Android media session and the user's optional Android notification-access grant. The dashboard release does not update the Android app. Without access, the app may report audible audio without track details. Decorative bars indicate playback rather than measured audio levels.

### Validation

50 JavaScript tests and 5 Python tests pass. Fourteen panel packages passed 70 browser fit cases across five portrait/landscape/narrow viewports. Physical ThinkView checks covered both orientations, additional canvas pages, the real idle music state and the native permission explanation. Notification access stayed off; real-track metadata after opt-in, arbitrary text scaling and overnight operation remain unverified. QA music/calendar fixtures are not included in release assets.

## 0.2.0 — 2026-11-01 (UTC)

- Redesigned thirteen panels with responsive Material-inspired hierarchy and semantic color roles.
- Added audio slider commit-on-release and debounced keyboard changes, with pending state separate from confirmed device values.
- Added renderer-owned notification priority and temporary expansion without rewriting saved panel sizes.
- Added optional labelled attention examples; their inputs are illustrative, and demo Snooze schedules no alarm.
- Passed 45 JavaScript and 5 Python tests, plus desktop Firefox visual checks. See [the original release notes](releases/0.2.0/RELEASE-NOTES.md) for that version's scope and limits.

## 0.1.0 — 2026-11-01 (UTC)

- Initial public modular dashboard release, with packaged panels, generic public configuration, verified bundle updates and browser data transfer.
- Included compact device controls and responsive portrait/landscape layouts.

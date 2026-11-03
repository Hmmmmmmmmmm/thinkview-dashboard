# Dashboard update log

Newest release first. Record user-visible changes, compatibility requirements and actual validation for each published version. Unreleased work belongs under Unreleased until publication. Dates use Asia/Shanghai unless marked otherwise.

## Unreleased

### Changes

- Now playing shows an optional measured system-output peak intensity meter in place of decorative playback bars. Track metadata remains available for music or video sources when published by the native service; video is not embedded.
- Output intensity requires a separate explicit Android permission action and can be disabled independently of track information. Stale or unavailable readings are hidden, and minimal/reduced-motion modes keep the current static reading.

### Compatibility

- The intensity meter requires a ThinkView app exposing music level API version 1 and Android output-mix Visualizer support. Older apps retain track information but cannot provide intensity. The Android permission is separate from notification access; the dashboard does not record microphone audio.

### Validation

- Automated checks and package validation are recorded with the implementation. Actual Android permission, capture behavior and device layout require device validation; this dashboard change alone does not update the Android app.

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

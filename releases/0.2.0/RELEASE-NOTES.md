# ThinkView Dashboard v0.2

- Responsive Material-Expressive-inspired redesign across all 13 panels, with clearer hierarchy, touch targets, themes, scrolling and compact/expanded layouts.
- Audio volume controls use static wavy sliders and commit on release or debounced keyboard adjustment without Apply. Pending requests remain distinct from confirmed device values.
- Timer typography and composition adapt to panel dimensions. Run expands, Pause retains the current expansion, and Stop restores the previous layout.
- Renderer-owned notification priority and temporary expansion preserve saved user dimensions. High attention stays ahead of queued medium attention until dismissed; emergency can preempt, and low does not auto-expand.
- Optional `?demo=attention` examples illustrate Weather, Dot, Calendar, Reminder and Alarm detail/actions through the actual renderer. Examples are clearly labelled dummy data. Real notification inputs remain unconnected; demo Snooze schedules no alarm. No native alarm/reminder service is implemented.

## Validation and limits

45 Node tests and 5 Python tests pass; generic release build validates. Independent visual review and actual desktop Firefox 159 screenshots covered responsive layouts, notification priority/dismissal/restoration and timer behavior. The final 0.2 package also passed ordinary startup and demo handoff smoke checks.

Target: bundled GeckoView 159 in the ThinkView Android 8.1 / ARMv7 shell. Desktop Firefox checks are not hardware certification. Native IME/insets, actual-device accessibility scaling/multitouch, microphone and overnight operation remain unverified. Standalone device Chrome/Firefox are retired; the old system WebView is separate.

Assets use generic public configuration. Existing account integrations and device controls still require their own supported configuration/capabilities. No device deployment is included.

## Asset SHA-256

- `thinkview-dashboard-bundle.html`: `1b37c18eb7e6fff7e251dee794bb72ca26fdb57f17b2f4f92abc911e7b79105d`
- `thinkview-dashboard.html`: `13e8fa9d6c2a1cca192eb6102cb41e0700beec912e7621cd178cc507fcd0ad44`

The bundle is also committed under `releases/0.2.0/` for the existing verified update flow.

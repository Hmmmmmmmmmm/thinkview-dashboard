# ThinkView Dashboard v0.3.2

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

## Asset SHA-256

- `thinkview-dashboard-bundle.html`: `21be2bb4f162cbf69514dbf41c8681928b5e382e4905cf3e5b273f959700ea97`
- `thinkview-dashboard.html`: `909c8baab9ef2b05763ef3af4d697baea63dd2f3b761706567e254c4faaf6acf`

The matching generic bundle is committed under `releases/0.3.2/`. Android app 0.9 is distributed separately; this release contains dashboard files only.

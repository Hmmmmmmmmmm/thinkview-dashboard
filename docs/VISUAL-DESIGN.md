# Visual design contract: bounded responsive panels

Current local dashboard: 0.3.2. Target runtime: ThinkView GeckoView 159 on Android 8.1 / ARMv7. This contract supersedes the 0.2 preference for larger text and internally scrolling cards. Keep the Material Color Utilities palette and paired semantic foreground/background roles. Do not add decorative annotations or invent account, device or playback data.

## Typography and containment

- Use 12px panel padding, 8px interior gaps and the shared rounded card shape. Typical headings are 13px, controls 12px, supporting text 10–11px. Clock, temperature and timer values scale with both available width and height. These are project choices, not Google requirements.
- Every panel is a bounded view with `overflow:clip`; no nested scroll surface. Essential controls must fit. Reflow before reducing text, page long lists, and use a separate dialog for editing or connection settings. Only that outside-card dialog and the outer canvas may scroll.
- Shared control height starts at 32 CSS px, with 26px pagination controls. Device screenshots demonstrate physical fit, not an Android accessibility target-size certification. Keyboard controls retain accessible names and focus paths.
- Use compact summaries and title ellipsis for long track/event identifiers. Preserve full notes through measured text pagination and an outside-card editor. No text is removed from storage to make a card fit.
- Paired colors do not by themselves prove contrast. The current fit pass did not repeat a complete contrast or 200% text audit.

## Grid and rotation

Measure the board after toolbar, padding and gaps rather than assuming viewport height or Android system bar dimensions. Preferred layout is two columns × three visible rows in portrait, three × two in landscape. The engine reduces columns/rows on small surfaces, using 190px width and 152px height as hints. Those hints must not force the grid beyond the usable board. Cells may be rectangular and change size on rotation; saved spans, order and pins remain intact.

Medium is 1×1 and Big is 2×1. Stored or temporary spans can extend beyond the visible row count; navigate the outer canvas to reach them. Toolbar arrows move a page when extra rows exist. Full screen hides global buttons and keeps swipe/menu canvas navigation. Ordinary panel taps do not reveal editing controls; long-press retains the menu and drag behavior.

Use package-local size containers for width and height queries. At short heights, the calendar shows the current week; agenda, notes and display controls page their contents. Never solve fit by making a panel scroll. `logic/panel-fit.js` supplies lifecycle-managed pagination and outside-card editors, and `web/styles/panel-fit.css` is loaded last to apply shared fit rules.

## Safe areas and editors

Native shell bounds may already exclude system bars. CSS safe-area environment values are a fallback; do not add assumed Android bar heights or sum overlapping insets. The board's measured client space is authoritative for the grid. Keyboard/IME behavior is separate from safe-area insets. Notes and calendar connection editors open as modal dialogs outside the cards; the notes text and selection are retained by moving the existing editor element.

## Motion

The clock colon flashes in bright/dark and remains steady in minimal mode. Now playing rotates the record and animates decorative bars only during reported playback. Paused/idle state stops those animations; minimal mode and reduced-motion preferences stop decorative motion. The bars are a playback indicator, not an audio waveform or measured equalizer. Do not label CSS easing a verified Material spring implementation.

## Current verification

All fourteen packages were exercised at 533×781, 805×509, 533×805, 853×533 and 320×640 CSS-pixel viewports using clearly labelled music/calendar/long-note fixtures outside shipped data. Across 70 panel cases, no card scroll overflow or essential controls outside a card were detected. Notes pagination and the outside-card editor were exercised, and playing versus minimal animation states were inspected. This is a finite layout matrix, not proof for arbitrary zoom, localization or every imported package.

Physical ThinkView screenshots show the installed compact first page and device/music page in both orientations. Six normal cards fit inside the usable canvas. The native music-access explanation was opened and cancelled; permission remains off. The real idle music state is verified; real track metadata and artwork after user opt-in remain unverified. Rotation and app display preferences were restored. See the parent project's `device-validation/dashboard-fit-v09/DEPLOYMENT.md` for local evidence, exact hashes and limits; no private device evidence belongs in the public dashboard repository.

Earlier 0.2 desktop Firefox stress/contrast work remains historical evidence and does not certify the changed 0.3.2 typography. Microphone, accessibility scaling, full IME behavior, multitouch arbitration and overnight operation remain separate validation tasks.

## Official references

- https://design.google/library/expressive-material-design-google-research
- https://m3.material.io/styles/color/the-color-system
- https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
- https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout
- https://developer.android.com/training/multiscreen/screendensities
- https://developer.android.com/develop/ui/views/layout/insets
- https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input/visibility
- https://www.w3.org/TR/css-env-1/ (working draft, not engine support evidence)
- https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

## Audio interaction and earlier fixture checks

The wavy active track is a static Material-Expressive-inspired illustration on a native volume slider, not an official component named "Google Doodle" and not a progress indicator. It does not imply playback or microphone activity. The native input keeps keyboard, touch and accessibility semantics; decorative SVG is aria-hidden and pointer-events:none.

Dragging previews a target without sending commands. Release/change commits through a 300ms trailing debounce; repeated keyboard changes coalesce. Requests are serialized and retain only the newest queued target per channel, bounded by the latest reported device maximum. Current labels continue to show device-reported levels. Command acceptance alone is not confirmation: pending, readback, rejection and unconfirmed-timeout states remain distinct. Unavailable services disable controls; unmount clears queued work. There is no Apply button.

An isolated localhost provider fixture exercised actual Firefox pointer release and keyboard changes, pending/readback, command errors and unconfirmed timeout. These are explicitly labelled test cases, not live device telemetry. Synthetic long calendar events are also labelled QA-only. The enlarged-text stress doubles computed font/line-height in temporary DOM styles; it proves the pictured reflow, not native browser zoom or an Android text-scaling setting.

The screenshot matrix covers normal, narrow, wide-short, tall, expanded and full-grid panel sizes plus bright/dark/minimal themes. Review-driven fixes addressed overflowing device summaries, narrow calendar headings, timer collisions under enlarged text and awkward enlarged-label wrapping. Actual-device IME, viewport/insets, multitouch arbitration, accessibility scaling, microphone permissions and overnight performance remain separate validation tasks.

## Renderer-owned attention expansion (round 3)

Notifications carry a priority and content to the dashboard renderer. Medium, high and emergency entries may temporarily expand their visible, unpinned source panel; low entries remain in the notification list. Highest priority wins, with arrival order among equals. A high alarm example stays ahead of medium weather until dismissed; emergency can preempt it. Nothing expires automatically. Pending entries remain in the list. Hidden/pinned panels do not automatically resize; changing eligibility allows queued entries to be reconsidered.

`data-temporarily-expanded` is renderer state, never persisted layout. The temporary size is at least 2×2, preserving a larger underlying manual/timer size. Dismissal reveals the next priority or restores underlying dimensions; saved order and dimensions are not rewritten. Existing timer Run/Pause/Stop and manual expansion remain independent. There is no notification policy schema in panel manifests.

The optional `?demo=attention` mode adds scenario buttons to Settings and exposes `DashboardAttentionDemo` for reproducible cloud visual checks. Weather, Dot, Calendar, Reminder and Alarm examples all enter the normal notification renderer; they are not a separate mock screen. Reminder is illustrated in Notes and Alarm in Clock. Every expanded example is visibly marked DEMO with disconnected-input disclosure. Snooze acknowledges the demo only and explicitly schedules nothing. Normal startup injects no examples and real data inputs remain unconnected. Future panel code can publish through `ctx.notifications.publish({priority,title,message,content})`; runtime binds the source panel and removes its owned notifications on unmount. These are trusted modules, not a security sandbox.

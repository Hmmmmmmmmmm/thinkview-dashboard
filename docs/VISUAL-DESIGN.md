# Visual design contract: responsive expressive panels

Target: the user-reported GeckoView 159 shell on Android 8.1 / ARMv7. Standalone Chrome and Firefox are retired on the device. Cloud browser checks are regression aids, not device certification. The original v0.1 source and accepted first-round screenshots are preserved. Iterative visual checks now use genuine desktop Firefox 159 renders with fixed time, matching fixtures and independent screenshot review. Desktop Firefox is a cloud regression aid, not proof of native GeckoView shell behavior.

## Principles and chosen dimensions

Google's Material expressive research uses hierarchy, size, shape, color and containment to guide attention. Here each panel has one dominant value or action, not thirteen identical small forms. Keep the existing Material Color Utilities palette and paired semantic foreground/background roles; do not invent new status or account data. Proposed dimensions below are project starting values, not mandatory Google specifications.

- 8px spacing rhythm; 16px group gaps; 28px card radius; 16px interior groups; pill-shaped primary actions.
- 16px outer margin below 600 CSS px, 24px above. Panel padding currently 16px on compact viewports and 20px otherwise. Further per-container padding tuning requires rendered evidence.
- Approximately 22px headings, 16px body, 13–14px metadata; large tabular hero numerals. Essential controls and text are not hidden merely because a card is short. Card scrolling is preferable to microscopic typography.
- 48 CSS px minimum functional control height and button width are starting web targets. Google's 48dp effective Android target still requires shell scaling verification. Static calendar date cells are not interactive targets.
- Paired semantic color roles do not prove contrast. Rendered contrast acceptance is text >=4.5:1 and nontext >=3:1 in bright/dark/minimal. Minimal mode uses neutral fills and outlined controls.
- No constant decorative motion; clock colon is steady. Respect reduced motion. Do not call CSS easing a verified Material spring implementation.

## Three safe-zone layers

1. Native shell bounds may already exclude system bars; neither shell bounds nor IME behavior were inspected here. Never hardcode an assumed Android bar height.
2. Browser `env(safe-area-inset-*, 0px)` is a fallback mechanism, not proof that native obstructions are covered. Zero may be correct or uninformative.
3. Dashboard breathing room is added after a single authoritative per-edge obstruction source. CSS `--safe-*` defaults to `env`; a future verified shell contract could override it in CSS pixels. Do not sum overlapping native and browser insets. IME height is not automatically a safe-area inset.

Edit tools occupy their own content row instead of overlaying titles. Focus rings use 2px outline plus 2px offset; capture tests must verify clearance. There is no invisible new drag overlay. Existing gesture/menu behavior remains unchanged. Pin/move hitboxes are 48px. The existing context menu offers resize alternatives; two-finger temporary expansion is documented in PANEL-SPEC.md; the menu remains its accessible alternative.

## Responsive strategy

Adapt panel interiors to container width and height rather than device branding. Use `min-width:0`, flexible rows, wrapped action labels and unbroken identifier wrapping. Tall content scrolls; do not silently hide functional controls. Proposed bands are <320 compact, 320–479 standard, >=480 roomy; short heights <240. Individual content may require different thresholds.

The redesign preserves the saved grid engine and its cell units. Fixed canvas geometry can produce small cards at narrow logical viewports; package-local reflow and reachable scrolling retain content, while manifest-declared temporary expansion offers a larger view without rewriting saved order/spans. This is not a claim that every panel fits every small cell without scrolling. See PANEL-SPEC.md for gesture, event and restoration semantics.

| Panel         | Preferred normal outer box (CSS px) | Priority / roomy behavior                                                           |
| ------------- | ----------------------------------: | ----------------------------------------------------------------------------------- |
| Clock         |                             224×160 | time/date; quiet timezone, no blinking                                              |
| Weather       |                             280×240 | temperature/location/refresh/status; supporting metrics and source remain reachable |
| Dot           |                             280×256 | chat entry dominant; Call/Dictate secondary, actions wrap                           |
| Calendar      |                             280×336 | month/navigation and all six static date rows; no silently omitted weeks            |
| Agenda        |                             280×320 | readable schedule/status; settings secondary; wider time/title columns              |
| Today         |                             280×288 | today's rows, side emphasis and clear state                                         |
| Next event    |                             280×248 | larger actual event title/time, never fabricated countdown                          |
| Focus         |                             280×304 | timer, Start/Pause, Stop/reset, explicit selected preset                            |
| Notes         |                             280×256 | >=160px baseline editable height, selection preserved                               |
| Audio         |                             280×352 | native illustrated sliders; release/change commits, no Apply                        |
| Connectivity  |                             280×288 | named status/action groups, no misleading switches                                  |
| Display       |                             280×352 | brightness, orientation and keep-awake controls                                     |
| Device status |                             280×288 | key/value hierarchy, unknowns remain unknown                                        |

These boxes are design targets, not enforced minimum widths that would create page overflow. Smaller saved cards need scroll/expand/reflow, not automatic destructive resizing. At 200% text, preferred box dimensions are not a guarantee: content must grow or scroll without loss.

## Validation matrix and remaining device checks

For all thirteen panels: bright/dark/minimal; preferred box, 320px, roomy 480px, short height and 200% text. Check essential content, focus-ring clipping, targets, contrast and horizontal overflow. Test long titles (80 characters), identifiers (64 unbroken characters), multiline errors and long localized dates using clearly labeled QA fixtures outside shipped account data.

Full dashboard synthetic viewports: 533×853, 853×533, 800×1280, 1280×800, 320×640. Physical 800×1280 at 240dpi nominally corresponds to about 533×853 Android dp, **not a measured CSS viewport**. Record actual inner/client/visual viewport, DPR, orientation and safe-area probe values when authorized evidence is available.

Test keyboard focus, Tab/Shift-Tab/Enter/Escape; notes/settings with IME; scroll vs longpress; pin/move/resize menu; persistence through rotation. Preserve input/focus. No assumption that 100vh shrinks with the keyboard. No claim of on-device overnight, microphone or shell permission validation.

Before/after screenshots must use identical time, data, service/account state, theme and viewport. Deliver thirteen readable pairs plus a contact sheet. Disconnected states are valid; fabricated real-looking account data is not.

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

## Audio interaction and test-fixture honesty

The wavy active track is a static Material-Expressive-inspired illustration on a native volume slider, not an official component named "Google Doodle" and not a progress indicator. It does not imply playback or microphone activity. The native input keeps keyboard, touch and accessibility semantics; decorative SVG is aria-hidden and pointer-events:none.

Dragging previews a target without sending commands. Release/change commits through a 300ms trailing debounce; repeated keyboard changes coalesce. Requests are serialized and retain only the newest queued target per channel, bounded by the latest reported device maximum. Current labels continue to show device-reported levels. Command acceptance alone is not confirmation: pending, readback, rejection and unconfirmed-timeout states remain distinct. Unavailable services disable controls; unmount clears queued work. There is no Apply button.

An isolated localhost provider fixture exercised actual Firefox pointer release and keyboard changes, pending/readback, command errors and unconfirmed timeout. These are explicitly labelled test cases, not live device telemetry. Synthetic long calendar events are also labelled QA-only. The enlarged-text stress doubles computed font/line-height in temporary DOM styles; it proves the pictured reflow, not native browser zoom or an Android text-scaling setting.

The screenshot matrix covers normal, narrow, wide-short, tall, expanded and full-grid panel sizes plus bright/dark/minimal themes. Review-driven fixes addressed overflowing device summaries, narrow calendar headings, timer collisions under enlarged text and awkward enlarged-label wrapping. Actual-device IME, viewport/insets, multitouch arbitration, accessibility scaling, microphone permissions and overnight performance remain separate validation tasks.

## Renderer-owned attention expansion (round 3)

Notifications carry a priority and content to the dashboard renderer. Medium, high and emergency entries may temporarily expand their visible, unpinned source panel; low entries remain in the notification list. Highest priority wins, with arrival order among equals. A high alarm example stays ahead of medium weather until dismissed; emergency can preempt it. Nothing expires automatically. Pending entries remain in the list. Hidden/pinned panels do not automatically resize; changing eligibility allows queued entries to be reconsidered.

`data-temporarily-expanded` is renderer state, never persisted layout. The temporary size is at least 2×2, preserving a larger underlying manual/timer size. Dismissal reveals the next priority or restores underlying dimensions; saved order and dimensions are not rewritten. Existing timer Run/Pause/Stop and manual expansion remain independent. There is no notification policy schema in panel manifests.

The optional `?demo=attention` mode adds scenario buttons to Settings and exposes `DashboardAttentionDemo` for reproducible cloud visual checks. Weather, Dot, Calendar, Reminder and Alarm examples all enter the normal notification renderer; they are not a separate mock screen. Reminder is illustrated in Notes and Alarm in Clock. Every expanded example is visibly marked DEMO with disconnected-input disclosure. Snooze acknowledges the demo only and explicitly schedules nothing. Normal startup injects no examples and real data inputs remain unconnected. Future panel code can publish through `ctx.notifications.publish({priority,title,message,content})`; runtime binds the source panel and removes its owned notifications on unmount. These are trusted modules, not a security sandbox.

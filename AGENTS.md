# Dashboard maintenance

- Scope work to this repository. Do not copy adjacent device, signing, backup or research material into it.
- Treat `web/` as shared presentation, `logic/` as application behavior, and `panels/<id>/` as a widget package.
- Register panels through `panels/catalog.json`. Preserve stable IDs and migrate stored layout state when needed.
- Do not edit generated `dist/` output. Use `tools/build.py`.
- Preserve private `config.local.json` and `.local/` files; never stage or publish them.
- Keep widgets independent of device dimensions. Use their own container queries and shared Material color roles.
- Clean up timers, requests and listeners on unmount. Require a user action for microphone and location requests.
- Run `npm test`; visually check relevant orientations, size presets and modes after UI changes.
- Do not add decorative annotations or simulated account data to the dashboard.

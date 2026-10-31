# Contributing

Keep presentation in `web/`, shared application logic in `logic/`, and widgets in `panels/`. Add new panels through the catalog and package contract, rather than introducing panel IDs into the layout engine.

Run `npm test` and `python3 tools/build.py` before submitting a change. Test visual changes in both orientations and in Big, Medium and Auto fit sizes. Verify bright, dark and minimal themes; long-press editing; full-screen entry/exit; and cleanup after disabling a widget.

Use `config.example.json` for distributable defaults. Keep account links, personal avatars and local settings in ignored local configuration. Generated `dist/` files, device tooling, credentials, logs and deployment evidence do not belong in a source contribution.

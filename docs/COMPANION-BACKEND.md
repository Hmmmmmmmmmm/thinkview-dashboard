# Companion backend interface v1

The dashboard provides a local draft and an explicit Open Dots action. A backend owns its account session and service integration. The dashboard does not send the draft, infer authentication from an open view, or start a call. The current Android backend supports opening only; read, send, call and authentication-status operations are not implemented.

`DashboardCompanion.create(transport)` accepts an injected adapter with these asynchronous methods, each receiving an `AbortSignal`:

- `capabilities(signal)` returns `{version: 1, provider: string, capabilities: {open, authStatus, read, send, call}}`, with Boolean flags. Version 1 acts only on `open`.
- `status(signal)` returns `{version: 1, availability, view, auth: "unknown"}`. Availability is `available`, `unavailable` or `error`; view is `closed`, `opening`, `open` or `error`. An open view does not establish that a user is signed in.
- `open(signal)` resolves `{ok: true}` when the request is accepted. Acceptance does not confirm that the page rendered. The dashboard calls it only following a user action and only when the backend reports open as available.
- Optional `dispose()` releases adapter resources.

For example, a host can inject its own transport:

```js
const companion = DashboardCompanion.create({
  capabilities: async signal => hostCompanionCapabilities(signal),
  status: async signal => hostCompanionStatus(signal),
  open: async signal => hostCompanionOpen(signal),
  dispose: () => releaseHostCompanion()
});
await companion.refresh();
// After an explicit user action, and only if companion.state().open:
await companion.open();
companion.dispose();
```

`refresh()` validates responses and exposes a bounded state through `state()`. Unsupported, malformed, unavailable, failed or timed-out backends do not enable opening. Requests time out after three seconds and are cancelled on disposal. `DashboardCompanion.lifecycle(window)` handles page hide and persisted back-forward cache restoration with a fresh adapter.

Without an injected adapter, the optional same-origin transport calls `/api/companion/v1/capabilities`, `/status` and `/commands`; the command body is exactly `{ "command": "open" }`. Its session cookie and ephemeral CSRF token are transport details, not account credentials or business state. The native backend chooses its own target; the dashboard sends no URL. Without a compatible backend, the existing standalone external link and local draft remain available.

The current Android integration is an interface checkpoint: the native Dots page remained blank during testing, and a public route returned HTTP 403 for an unknown reason. Successful page rendering, sign-in, reading, sending and calling have not been verified.

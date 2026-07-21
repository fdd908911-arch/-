# Frontend architecture

The frontend is being separated incrementally without a framework rewrite.
Every intermediate commit must remain directly deployable as static files.

## Dependency direction

```text
HTML page
  -> core runtime
  -> API endpoint facade
  -> feature modules
  -> page orchestrator
```

- `core/` owns browser infrastructure such as persisted connection state,
  authenticated requests, URL construction, and cross-tab synchronization.
- `ccc-api.js` names backend domain endpoints. It must not own page rendering or
  duplicate transport logic.
- `features/` owns a complete user-facing capability. A feature receives the
  few page callbacks it needs and keeps its own DOM and transient state.
- Root page scripts such as `volo.js` coordinate features, sessions, and page
  lifecycle. Feature implementations must not be copied back into them.

The current scripts remain classic browser scripts while the legacy pages are
split. Their order is therefore explicit and checked by
`scripts/check-architecture.js`.

## Current boundaries

- `core/ccc-runtime.js`: connection configuration, legacy base-URL migration,
  authentication, JSON/blob transport, session selection, and storage events.
- `ccc-api.js`: CcCompanion endpoint facade and connection-dialog integration.
- `features/volo-media-status.js`: coordination for the status surface shared by
  voice recording and music analysis.
- `features/volo-chat.js`: message cache, merge ordering, history loading,
  incremental polling, optimistic sends, typing state, and message rendering.
- `features/volo-composer.js`: per-session draft persistence, input sizing,
  keyboard submission, send-button state, and failed-send restoration.
- `features/volo-drawer.js`: drawer visibility, accessibility state, focus, and
  hash-change cleanup.
- `features/volo-carrier.js`: Gateway/Claude Code label, composer placeholder,
  and usage-panel presentation.
- `features/volo-sessions.js`: session roster and connection state, Gateway
  virtual session, session creation, compact, start, and stop dialogs.
- `features/volo-music.js`: upload analysis, music message parsing, cards,
  spectrum state, synchronized lyrics, audio playback, and player lifecycle.
- `features/volo-voice.js`: press-to-record interaction, microphone lifecycle,
  upload, and voice-analysis message formatting.
- `features/volo-usage.js`: Gateway usage sidebar state, loading, formatting,
  and rendering.
- `volo.js`: feature construction, cross-feature session selection, and send
  orchestration. It does not query page DOM directly.

## Regression checks

- `npm run check` validates static references, classic-script order, legacy API
  migration, feature ownership, and the `volo.js` size ceiling.
- `npm run check:browser` runs the deployed chat and Drivesoid dashboards in
  desktop Chromium and an Android Chrome viewport. Set `CCC_TEST_TOKEN`, or
  point `CCC_TEST_TOKEN_FILE` at a file containing the browser access token.
  `CCC_TEST_ORIGIN`, `PLAYWRIGHT_CORE_PATH`, and `CHROMIUM_PATH` can override
  the deployed origin and local browser tooling.

## Next safe extractions

1. Keep `volo.js` limited to feature construction and cross-feature callbacks.
2. Migrate one stable page at a time from classic globals to ES modules.
3. Split memory detail renderers and arc visualization out of
   `memory-dashboard.js`.

Do not add a new build tool until the runtime boundaries are stable. When ES
modules are introduced, migrate one page entry at a time and extend the static
checker to follow imports before removing the classic-script ordering checks.

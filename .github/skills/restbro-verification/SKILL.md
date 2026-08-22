---
name: restbro-verification
description: 'How to test and verify changes in the Restbro Electron app before calling work done — vitest conventions (__tests__ folders, electron mock, @vitest-environment jsdom, coverage include list), the mandatory lint/build/test gates, and driving the live UI through a Chrome DevTools Protocol harness against a throw-away user profile. Use before finishing any task, when adding unit tests, when a change needs real UI verification, when CI fails, or when asked to "verify", "check it works", "run the tests", or "make sure nothing broke". Also lists the release/packaging scripts agents must never run.'
---

# Restbro — Testing & Verification

## 1. The mandatory gates

Nothing is done until all three pass:

```bash
npm run lint        # eslint src --ext .ts  → 0 errors (warnings OK)
npm run build       # main + preload + renderer, must compile clean
npm test -- run     # vitest single run (what CI runs)
```

CI (`.github/workflows/ci.yml`) runs `npm ci → lint → build → test -- run` on
macOS / Node 20. Run them locally first; do not hand back failing work.

Useful variants: `npm run lint -- --fix`, `npm run format`,
`npx vitest run <path>` for a focused file, `npm run test:coverage`.

## 2. Unit tests

- Location: `__tests__/` **next to the code** (`src/main/modules/__tests__/`,
  `src/shared/__tests__/`, `src/renderer/components/<feature>/__tests__/`).
- Naming: `<subject>.test.ts`. Include: `src/**/__tests__/**/*.test.ts`.
- Default environment is `node`. DOM tests opt in per file:

  ```ts
  /**
   * @vitest-environment jsdom
   */
  ```

- **Never import Electron directly.** Mock it first:

  ```ts
  vi.mock('electron', async () => import('../../../__mocks__/electron'));
  ```

  Extend [src/__mocks__/electron.ts](../../../src/__mocks__/electron.ts) when a
  new Electron API is needed — don't create a parallel mock.

### What to test

Pure logic, always: variable resolution, importers, formatters, code
generators, route matching, percentile math, state reducers, persistence
sanitizers. Extract logic out of DOM-heavy classes so it *can* be tested.

For DOM managers, test the **wiring** with jsdom — dispatch the CustomEvent and
assert the observable effect (see
`src/renderer/components/tabs/__tests__/response-clear-wiring.test.ts` and
`collections-core-request-isolation.test.ts`, which spy on private render
methods). Regression tests should encode the bug, not the implementation.

### Coverage

Thresholds are 80% statements/branches/functions/lines over an **explicit
include list** in [vitest.config.ts](../../../vitest.config.ts). New
pure-logic renderer files under `components/` are not covered automatically —
add the path to `coverage.include` when you add a testable module.

## 3. Live UI verification (CDP harness)

Unit tests can't prove a tab renders. When a change is visual or flow-level,
drive the real app.

**Always use a throw-away profile** so the user's real
`~/Library/Application Support/Restbro/database.json` is never touched:

```bash
npm run build
npx electron . --remote-debugging-port=9222 \
  --user-data-dir="$TMPDIR/restbro-verify-profile"
```

Then talk to `http://127.0.0.1:9222/json` over WebSocket. Node 25 has global
`WebSocket`/`fetch`, so a ~60-line CDP client is enough — Playwright is not
needed and is not a dependency.

Verified gotchas (do not rediscover these the hard way):

- Send `Emulation.setFocusEmulationEnabled {enabled:true}` **and**
  `Page.setWebLifecycleState {state:'active'}` first. Without them Monaco never
  paints `.view-line` in an occluded window and every editor reads as empty.
- `Page.captureScreenshot` always fails for the occluded window. Verify via DOM
  queries instead.
- Do **not** pass `timeout` to `Runtime.evaluate` — the response may never
  arrive and the client hangs. Use an external watchdog.
- Monaco input: focus `textarea.inputarea`, then `Input.insertText`. To replace,
  first `Input.dispatchKeyEvent` Meta+A with `commands:['selectAll']`.
- Visibility must use `getComputedStyle` + `getBoundingClientRect`, **not**
  `offsetParent !== null` — modals are `position: fixed`.
- Modals/dialogs are appended to `document.body` with `z-index >= 1000` and no
  class. Find them by filtering `document.body.children`.
- Native dialogs (import/export, open file, CSV/PDF save) **block automation** —
  exercise the underlying IPC via `window.restbro.*` in `Runtime.evaluate` instead.

Key selectors: nav `.nav-tab[data-tab="…"]`, panels `#<tab>-tab.tab-content`,
API tab `#request-method`, `#request-url`, `#send-request`, `#meta-status`,
`#response-body`, body editor host `#request-body-editor-host`.

Always clean up:

```bash
pkill -f "restbro-verify-profile"; rm -rf "$TMPDIR/restbro-verify-profile"
```

## 4. Manual pass for UI work

1. Switch through all 6 themes — nothing should lose contrast or accent color.
2. Toggle `layoutMode` horizontal/vertical.
3. Resize the window narrow; check the sidebar/main split and scrollbars.
4. Restart the app — persisted state must survive and old databases must still load.

## 5. Never run

`npm run release*`, `npm run ship:*`, `npm run dist*`, `npm run publish:*`, or
the scripts in `scripts/` — they sign, notarize and publish. Never commit
`dist/`, `release/`, `coverage/`, or `node_modules/`. Never push to `main`,
force-push, or use `--no-verify`.

## Maintaining this skill

Update this file in the same PR when you change the `scripts` block in
`package.json`, `vitest.config.ts` (environment, include globs, coverage
allow-list, thresholds), `.github/workflows/ci.yml`, or
`src/__mocks__/electron.ts`. Add any newly discovered CDP gotcha to §3 so the
next agent doesn't rediscover it.

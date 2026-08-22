---
name: restbro-main-process
description: 'Restbro main-process and IPC architecture — adding whitelisted IPC channels in src/shared/ipc.ts, handlers in ipc-manager.ts, focused service modules under src/main/modules, the preload contextBridge, StoreManager persistence in database.json, and the security rules (approved paths, secret redaction, no renderer file access). Use when a feature needs files, network, native dialogs, child processes, OAuth, mock servers, load tests, or anything that must persist across restarts; when adding window.restbro APIs; when writing or migrating AppState; or when reviewing Electron security. Prevents dynamic IPC channels, path traversal, leaked tokens, data-loss migrations, and god modules.'
---

# Restbro — Main Process, IPC & Persistence

Main is the only trusted process. It owns the filesystem, the network, native
dialogs, and all secrets. The renderer can do nothing except call the explicit
methods on `window.restbro`.

## 1. Channel → handler → bridge

### `src/shared/ipc.ts`

```ts
FEATURE_DO_THING: 'feature:do-thing',
```

Namespace matches the feature; verb is kebab-case. Group under a `//` comment
block with siblings. Push channels (main → renderer) are named for the fact:
`feature:progress`, `feature:status-changed`.

**Never** compute a channel name at runtime. **Never** add a
"call any function" handler.

### `src/main/modules/ipc-manager.ts`

Register the handler; keep it thin and delegate:

```ts
ipcMain.handle(
  IPC_CHANNELS.FEATURE_DO_THING,
  async (_, params: FeatureParams) => featureService.doThing(params)
);
```

- Type the payload with a shared type — never `any` past the boundary.
- Validate anything renderer-supplied *inside main* (ids, paths, limits).
- Return structured results (`{ ok, error? }` or a typed object). Let the
  renderer render the error; do not `throw` raw Node errors across IPC.
- Push events go through the window's `webContents.send(...)`.

### `src/preload/index.ts` — two edits

1. The file keeps an **inlined copy of `IPC_CHANNELS`** (it cannot import from
   `src/shared` under sandbox). Add the constant there too, or you get
   `undefined` channels at runtime.
2. Add the typed method under the matching `restbroAPI.<group>` object, and
   update the exported typings if shared shapes changed.

Preload contains **no logic** — just `ipcRenderer.invoke`/`on` wrappers.
Subscriptions return an unsubscribe function.

## 2. Service modules — `src/main/modules/*.ts`

One concern per file, **≤ 300 lines**, exported as a singleton instance
(`export const featureService = new FeatureService()`), matching
`request-manager.ts`, `oauth.ts`, `mock-server-manager.ts`, `network-speed.ts`.
Bigger subsystems get a folder (`mock-server/`, `importers/`).

Boot order lives in `src/main/index.ts`: store → AI → IPC → window, with
`storeManager.flush()` on quit. Anything with a timer or socket needs an
explicit shutdown path.

Existing behaviour you must not casually change:

- **Networking** — requests run through Node `http`/`https` in
  `request-builder.ts` / `request-manager.ts`, never renderer `fetch`.
  Variable precedence is **request > environment > folder chain (nearest
  ancestor wins) > globals** (`variables.ts`). Never override a user-supplied
  header; auto-set `Content-Type`/`Content-Length` only when absent.
  Cancellation is keyed by request id.
- **OAuth** (`oauth.ts`) — auth code + PKCE, client credentials, device code.
  Validate `state`; always destroy the auth `BrowserWindow`; refresh only when
  expired; persist the updated config back to the request/collection.
- **AI** (`ai-engine.ts`) — local LLM at `http://localhost:9999` only. Stream
  chunks over IPC. Enforce `AI_MAX_CONTEXT_CHARS`. Never call a third-party AI service.
- **Load test** (`loadtest-engine.ts`) — token-bucket RPM; report p50/p95/p99 and
  status distribution; cancellation must drain in-flight workers.
- **Mock server** (`mock-server/`) — lifecycle owned by main; the renderer only commands.

## 3. Persistence — `store-manager.ts`

Single file: `app.getPath('userData')/database.json`, mode `0600`, debounced
500 ms writes, `flush()` on quit, rolling backups (max 5, auto every 24 h).

To add persisted state:

1. Add the field to `AppState` in `src/shared/types.ts`.
2. Add a `default…` constant and include it in `defaultState`.
3. Extend `mergeLoadedData()` so old databases get the default **merged in**.
4. Read it in `RestbroRenderer.loadInitialState()`, write it in `saveState()`.

Rules:

- **Migrations are additive only.** Merge loaded data into `defaultState`.
  Never delete, rename in place, or reshape a field that existing users have —
  a bad migration destroys real user data.
- Never write files from the renderer. Route small UI state through the
  dedicated channels (`collections-state:*`, `jsonviewer-state:*`) or `store:set`.
- Cap anything unbounded in `sanitizeUpdatesForPersistence()` (open-tab bodies
  5 MB, json-compare 256 KB/side, history metadata only). New large payloads
  need their own cap.
- Deleting or overwriting collections/requests requires explicit user confirmation.
- `restoreLockUntil` intentionally drops writes during a Time Machine restore —
  don't "simplify" it away.

## 4. Security — non-negotiable

- Keep `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in
  `window-manager.ts`. Never weaken them, not even temporarily.
- **File paths from the renderer are untrusted.** They are only honoured if
  registered in `approved-paths.ts` (via a native dialog or an OS file-open
  event); otherwise return `FILE_ACCESS_DENIED_MESSAGE`. `approveFile()`
  resolves paths so `../` cannot escape.
- Validate any renderer-supplied id used in a path (see `restoreBackup`'s
  `/[\/\\]|\.\./` guard).
- **Never log or return secrets.** Use `redactHeaders` / `isSensitiveHeader`
  from `src/shared/redact.ts` (and `redact-snippet.ts` for generated cURL)
  instead of `JSON.stringify(headers)`. This covers Authorization, cookies,
  tokens, API keys, client secrets, JKS passwords, private keys.
- No telemetry, analytics, crash-reporting SaaS, or remotely loaded code.
- External links go through `system:open-external` (`shell.openExternal`), never
  `window.open` to an untrusted URL.

## 5. Checklist

- [ ] Channel in `src/shared/ipc.ts` **and** the preload inline copy
- [ ] Handler in `ipc-manager.ts` delegating to a ≤ 300-line module
- [ ] Payloads typed from `src/shared/types.ts`; validated in main
- [ ] Structured error results, not thrown Node errors
- [ ] Any path checked against `approvedPaths`
- [ ] Secrets redacted before logging/returning
- [ ] New `AppState` field defaulted **and** merged for old databases
- [ ] Unbounded payloads capped in `sanitizeUpdatesForPersistence`
- [ ] Timers/sockets cleaned up on quit

## Maintaining this skill

Update this file in the same PR when you change `src/shared/ipc.ts`,
`src/preload/index.ts`, `ipc-manager.ts`, `store-manager.ts` (defaults,
migrations, sanitizers, backup retention), `approved-paths.ts`,
`src/shared/redact.ts`, or `window-manager.ts` security flags. If a rule here
no longer matches the code, the code wins — fix the skill.

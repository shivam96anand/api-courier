# AGENTS.md — Restbro

> Canonical guide for AI coding agents (Claude Code, GitHub Copilot, Codex, Cursor, Aider, etc.) working in this repository. `CLAUDE.md` and `.github/copilot-instructions.md` point here — keep this file as the single source of truth.

## 1. Project at a glance

- **Restbro** is a free, open-source desktop API testing tool — a privacy-respecting alternative to Postman/Insomnia.
- Public site: <https://restbro.com>. Releases: GitHub Releases.
- **Stack:** Electron 26 + TypeScript 5 + Webpack 5 + vanilla TS renderer (with isolated React/MUI islands for a few features such as JSON Compare). Monaco editor, CodeMirror 6, jsondiffpatch.
- **Process model:** classic Electron three-tier — `main` (Node.js, trusted) ↔ `preload` (contextBridge) ↔ `renderer` (sandboxed browser). See [docs/architecture.md](docs/architecture.md).
- **Persistence:** single JSON file at `app.getPath('userData')/database.json` managed by `StoreManager` (debounced writes, `flush()` on quit). No SQLite, no localStorage.

## 2. Quick start (commands you'll actually run)

```bash
npm install              # one-time
npm run dev              # watch main + dev server for renderer
npm start                # launch packaged Electron against ./dist
npm run build            # build main + preload + renderer (production)
npm run lint             # eslint src --ext .ts
npm run lint -- --fix    # autofix
npm run format           # prettier --write src
npm test                 # vitest (watch)
npm test -- run          # vitest single run (what CI uses)
npm run test:coverage    # coverage report → ./coverage
npm run clean            # rm -rf dist
npm run rebuild          # clean + build
```

Packaging / release scripts (`dist:*`, `release:*`, `ship:*`) require signing/notarization secrets and **must not be invoked by agents**.

## 3. Repo map

```
src/
├── main/                       # Node.js process — trusted
│   ├── index.ts                # boot: store → AI → IPC → window; flush() on quit
│   └── modules/                # one concern per file (≤ 300 lines each)
│       ├── ipc-manager.ts          # registers all whitelisted IPC handlers
│       ├── store-manager.ts        # database.json, debounced writes
│       ├── window-manager.ts       # BrowserWindow + security flags
│       ├── request-builder.ts      # assemble req, resolve {{vars}}, headers
│       ├── request-manager.ts      # request lifecycle + cancellation
│       ├── request-error-formatter.ts
│       ├── variables.ts            # request > env > folder > global precedence
│       ├── oauth.ts                # auth code + PKCE, client creds, device code
│       ├── ai-engine.ts            # local LLM streaming
│       ├── ai-system-prompt.ts
│       ├── curl-executor.ts
│       ├── loadtest-engine.ts      # token-bucket RPM + percentiles
│       ├── loadtest-export.ts      # CSV/PDF
│       ├── jks-parser.ts           # SSL cert parsing
│       ├── notepad-ipc.ts
│       ├── update-manager.ts       # electron-updater
│       ├── mock-server/            # mock server subsystem
│       └── importers/              # Postman / Insomnia / API Courier
├── preload/index.ts            # contextBridge → window.restbro.* (no logic)
├── shared/                     # imported by both main and renderer
│   ├── types.ts                # domain types (Collection, ApiRequest, ApiResponse, …)
│   ├── ipc.ts                  # IPC_CHANNELS — single source of truth
│   ├── system-variables.ts     # {{timestamp}}, etc.
│   ├── code-generators.ts
│   └── request-builder-shared.ts
├── renderer/                   # sandboxed UI (vanilla TS managers + DOM events)
│   ├── index.ts, event-listeners.ts
│   ├── components/<feature>/   # one folder per feature
│   ├── tabs/, utils/, types/, styles/
└── features/json-compare/      # standalone React + Web Worker island
```

Tests live in `__tests__/` folders next to the code (`src/main/modules/__tests__`, `src/shared/__tests__`, `src/renderer/components/__tests__`, …). Electron is mocked via `src/__mocks__/electron.ts`.

## 4. Non-negotiables (hard rules)

1. **Electron security flags stay on:** `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` (see `src/main/modules/window-manager.ts`). Never weaken them.
2. **Renderer is sandboxed.** No `require`, no `ipcRenderer`, no `fs`, no `fetch`-to-disk. Use only `window.restbro.*` exposed by the preload bridge.
3. **All persistence goes through `StoreManager`** in main → `database.json`. Never use `localStorage`, `sessionStorage`, or write files from the renderer.
4. **IPC is whitelisted and explicit.** Add channels to `src/shared/ipc.ts`; no dynamic channel names, no generic "invoke anything" pass-through.
5. **All file/network/native operations live in main** and are exposed via IPC.
6. **Never log or render secrets** — Authorization headers, OAuth tokens, client secrets, JKS passwords, API keys. Redact before logging and before showing in UI/error messages.
7. **No telemetry, no analytics, no runtime CDN-loaded code.** Restbro is privacy-first.

## 5. File-size & modularity

- Main-process modules: **≤ 300 lines**.
- Renderer components/managers: **150–300 lines** (soft target).
- When a file grows, split into helpers/sub-modules — do not create god files.
- Prefer pure functions for anything testable (variable resolution, formatters, parsers).

## 6. How to add or change a capability (required sequence)

1. Update / add types in [src/shared/types.ts](src/shared/types.ts) so main and renderer agree.
2. Add IPC channel constants in [src/shared/ipc.ts](src/shared/ipc.ts) (`IPC_CHANNELS.*`).
3. Implement the handler in [src/main/modules/ipc-manager.ts](src/main/modules/ipc-manager.ts) (delegating to a focused module).
4. Expose a typed API in [src/preload/index.ts](src/preload/index.ts) under `window.restbro.<group>.*`. Update preload typings if shared shapes change.
5. Consume from the renderer via `window.restbro.*` — never `ipcRenderer` directly.
6. Persist via store IPC (`store:get` / `store:set`) — the renderer never writes files.
7. Add unit tests for any pure logic (variable resolution, formatting, parsing) under the nearest `__tests__/`.

## 7. Subsystem rules

### Persistence (`store-manager.ts`)
- `database.json` with debounced writes; always `flush()` on shutdown.
- Migrations are **additive**: merge loaded data into `defaultState`; never break older shapes.
- Save **response metadata** (status, time, size) in history; avoid persisting huge bodies.
- Don't delete or overwrite collections/requests without explicit user confirmation.

### Networking (`request-builder.ts`, `request-manager.ts`)
- Requests run in main via Node `http` / `https` (not renderer `fetch`).
- Variable precedence: **request > environment > folder chain > global** (`modules/variables.ts`).
- Never override user-supplied headers. Auto-set `Content-Type` / `Content-Length` only when missing.
- Cancellation must work by request id.
- Errors return structured objects shaped for the UI — see `RequestErrorFormatter`.

### OAuth (`oauth.ts`)
- Supported grants: Authorization Code (with PKCE), Client Credentials, Device Code.
- Validate `state`. Always cleanly tear down auth `BrowserWindow`s.
- Refresh tokens only when expired; persist updated config back to the request/collection.

### AI (`ai-engine.ts`)
- Local LLM expected at `http://localhost:9999` (Qwen 2.5 7B reference). Never call third-party AI services from the app.
- Streaming via IPC: main emits chunks, renderer subscribes.
- Enforce `AI_MAX_CONTEXT_CHARS`; fail gracefully with a useful UI error.

### Mock server (`mock-server/`)
- Multiple instances, route matching: exact / prefix / wildcard (`*`, `**`) / regex.
- Lifecycle (`start` / `stop`) is owned by main; renderer only commands.

### Load testing (`loadtest-engine.ts`)
- Token-bucket RPM scheduling. Report p50/p95/p99 and status distribution.
- Cancellation must terminate in-flight workers cleanly.

## 8. UI / UX conventions

- Vanilla TS "manager" pattern with custom DOM events for cross-component updates. **Don't introduce a global state framework.**
- React / MUI is allowed only as **isolated islands** wrapped by a vanilla manager (e.g., `features/json-compare`).
- Preserve existing keyboard shortcuts (Send/Cancel, tab nav, Notepad shortcuts).
- Themes are a finite set (Blue/Green/Purple/Orange/Red/Magenta) — extend, don't replace.

## 9. TypeScript & code style

- TypeScript-first. Avoid `any` except at strict boundaries (parsing untrusted input, IPC edges).
- Three separate `tsconfig.json`s — `src/main`, `src/preload`, `src/renderer`. Don't import across processes; share via `src/shared/`.
- Lint with ESLint (`@typescript-eslint`) + Prettier. Run `npm run lint -- --fix` before committing.
- Prefer small pure helpers over inheritance hierarchies.

## 10. Testing

- Framework: **vitest** with `jsdom` environment.
- Add tests for pure logic whenever feasible (variable resolution, importers, formatters, code generators, mock-server route matcher).
- Electron is mocked at `src/__mocks__/electron.ts`. Don't import Electron directly in tests.
- CI (`.github/workflows/ci.yml`) runs `npm ci → lint → build → test -- run` on macOS / Node 20.

## 11. Dependencies

- Avoid heavy dependencies unless they replace significant complexity and are clearly justified.
- No new analytics, telemetry, error-reporting SaaS, or runtime CDN scripts.
- New native modules require explicit discussion (they break universal Mac builds).

## 12. Commits, branches, PRs

See [CONTRIBUTING.md](CONTRIBUTING.md). Quick reminders for agents:

- Branch prefixes: `feature/`, `fix/`, `docs/`, `refactor/`, `ci/`.
- One feature/fix per PR; fill out the PR template (What / Why / Impact).
- PRs are **squash-merged**. Keep commit messages descriptive.
- **Do not** push to `main`, force-push, or run release/publish scripts.
- **Do not** commit anything under `dist/`, `release/`, `coverage/`, or `node_modules/`.

## 13. Pre-finalization checklist (MANDATORY)

Before declaring any task complete, run all three locally and fix every failure:

```bash
npm run lint        # 0 errors (warnings OK)
npm run build       # must compile cleanly
npm test -- run     # all unit tests pass
```

If any of these fail, the task is not done.

## 14. Things to never do

- Disable Electron sandbox / contextIsolation / nodeIntegration.
- Use `localStorage` / `sessionStorage` for persistence.
- Call `ipcRenderer` directly from the renderer.
- Add a generic "invoke any channel" IPC handler.
- Log Authorization headers, tokens, passwords, or full secret payloads.
- Add telemetry, analytics, crash-reporting SaaS, or remote code loading.
- Run `npm run release*`, `npm run ship:*`, `npm run dist*`, or `npm run publish:*`.
- Commit generated artifacts (`dist/`, `release/`, `coverage/`).
- Edit code-signing entitlements or `electron-builder` publish config without being asked.
- Rewrite Postman/Insomnia importer formats — extend, don't replace; users depend on backward compatibility.

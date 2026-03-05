# API Courier — Repo Instructions (Claude/Copilot)

API Courier is a secure Electron desktop app for API testing (Postman/Insomnia-like) with Collections, History, Environments/Globals, OAuth2, Load Testing, JSON tools, Notepad, and Ask-AI.

## Non-negotiables (hard rules)
- Keep Electron security: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` (see `src/main/modules/window-manager.ts`).
- Renderer must NOT use Node/Electron APIs directly. Use only `window.apiCourier.*` (preload bridge).
- Persistence is **main-process only** via StoreManager → `app.getPath('userData')/database.json`. **Never use localStorage**.
- IPC must stay **whitelisted + explicit** (no dynamic channel names, no generic “invoke anything”).
- Any file/network/native operation must be done in **main** and exposed via IPC.
- Never log secrets (Authorization, tokens, client secrets). Redact before logging and before rendering.

## File size / modularity rules
- Keep files small and modular:
  - **Main-process modules:** ≤ **300** lines
  - **Renderer components/managers:** ideally **150–300** lines
  - If a file grows, split into helpers/modules (don’t create “god” files).

## Repo map (where code goes)
- `src/main/index.ts`: boot (store, AI, IPC, window) + graceful shutdown flush.
- `src/main/modules/*`: main services (request, oauth, store, loadtest, ai, import, etc.).
- `src/preload/index.ts`: `contextBridge` API only (`window.apiCourier`); minimal logic.
- `src/shared/{types.ts, ipc.ts}`: shared contracts + IPC channel constants.
- `src/renderer/*`: UI; mostly vanilla TS “managers” + DOM events.
- React allowed only as **isolated islands** wrapped by a vanilla manager (e.g., Json Compare).

## How to add/change a capability (required sequence)
1) Add/extend types in `src/shared/types.ts` (keep renderer/main aligned).
2) Add IPC constants in `src/shared/ipc.ts` (`IPC_CHANNELS.*`).
3) Implement main handler in `src/main/modules/ipc-manager.ts`.
4) Expose typed API in `src/preload/index.ts` under `window.apiCourier.<group>.*`.
   - If shared shapes change, update preload typings too.
5) Consume in renderer via `window.apiCourier...` (never `ipcRenderer` directly).
6) Persist via store IPC (`store:set` etc.). Renderer never writes files.

## Persistence rules (current design)
- Store is `database.json` with debounce + `flush()` on app exit.
- Migrations must be additive: merge loaded data into `defaultState` (backward compatible).
- Prefer saving **response metadata** (status/time/size) over huge bodies.
- Auth tokens: store minimally; avoid logging; prefer user-controlled persistence.
- Do not delete or overwrite collections/requests without user confirmation.

## Networking rules (current design)
- Requests execute in main via Node `http/https` (not renderer fetch).
- Variable resolution `{{var}}` precedence: request > env > folder chain > globals (`modules/variables.ts`).
- Don’t override user headers; auto Content-Type/Length only when missing (see `RequestBuilder`).
- Cancellation must work by request id.
- Errors must return structured objects for UI (see `RequestErrorFormatter` patterns).

## OAuth rules (current design)
- Supported grants: auth code (PKCE), client credentials, device code (`modules/oauth.ts`).
- Validate `state`; cleanup auth windows reliably.
- Refresh only when expired; ensure updated config can persist back to selected request/collection.

## AI rules (current design)
- Local LLM server: `http://localhost:9999`.
- Streaming via IPC: main emits chunks; renderer subscribes.
- Enforce `AI_MAX_CONTEXT_CHARS`; fail gracefully with useful UI errors.

## UI/UX conventions
- Preserve existing layout and vanilla manager pattern; use custom DOM events for cross-component updates.
- Keep keyboard shortcuts stable (send/cancel/navigation).
- Avoid introducing global state frameworks unless absolutely necessary.

## Dependency policy
- Avoid heavy dependencies unless they replace significant complexity and are justified.
- Prefer small utilities and pure functions; keep bundles lean.
- No telemetry/analytics, no runtime CDN-loaded code.

## Quality bar
- TypeScript-first; avoid `any` except at strict boundaries (parsing/untrusted input).
- Add `vitest` tests for pure logic when feasible.
- Must pass `npm run build` and lint/format before commit.

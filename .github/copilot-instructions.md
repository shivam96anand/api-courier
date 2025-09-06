# API Courier - Copilot Instructions

This is an Electron desktop application for API testing, similar to Postman and Insomnia.

## Architecture
- **Main Process (TypeScript, modularized):** Located under `src/main/`. Must be split by concern into small modules (bootstrap, windows, IPC, persistence, request engine, OAuth/OIDC, file dialogs, logging). No single file may exceed ~300 lines.
- **Preload Script:** `src/preload/` bridge exposing only whitelisted, documented APIs. No generic invoke or wildcard channels.
- **Renderer Process:** `src/renderer/` UI in HTML/CSS/TypeScript. Runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

## Key Features
- HTTP request testing (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
- Request collections and organization.
- Environment variables and quick environment switching.
- Request history.
- Response visualization (Pretty, Raw, Headers) with format detection.
- Authentication support (None, Basic, Bearer, API Key, OAuth 2.0 including Discovery, PKCE, Device Code, Refresh).
- Import/Export functionality (Postman/Insomnia or other tools collections).
- “Save As…” for responses via native file dialog.
- Keyboard shortcuts for send/cancel and navigation.
- Optional secure storage for secrets and refresh tokens.
- Automatic token refresh (see OAuth section for constraints).

## Persistence Guidelines (IMPORTANT)
- Do **not** use `window.localStorage` for saving data.
- All persistent state (tabs, collections, environments, history, settings, response metadata) must be stored in a **disk-backed JSON database** at the app’s user data directory.
- Use a persistence utility that wraps the JSON database and provides typed CRUD methods. It must:
  - Initialize with a known schema.
  - Validate payloads before writing.
  - Coalesce writes via a **write queue/debounce** and flush on app exit.
- Access persistence **only from the main process** through **strictly defined IPC**. The renderer must never read/write files directly.
- Add optional secure secret storage. Prefer OS keychain for client secrets and refresh tokens when enabled.

## Development Guidelines
- Use **TypeScript** across main, preload, and renderer.
- Enforce **ESLint + Prettier**; add **pre-commit hooks** to run lint/format on staged files.
- Add **unit tests** for pure logic and **smoke tests** for key user flows.
- Keep modules cohesive and small. **Never** aggregate multiple concerns in one file.
- Provide user-friendly error states and non-blocking UI updates.
- Follow Electron security best practices; never relax them without an explicit setting.

## Code Style
- Favor clear names, small pure functions, early returns, and explicit types.
- Use async/await consistently with structured error handling and user feedback.
- Redact secrets in all logs and UI surfaces. Do not log tokens, cookies, or client secrets.
- Prefer immutable updates for UI state; keep renderer state separate from persisted state.
- Document every IPC channel: purpose, request/response shapes, and error cases.

## Dependencies
- Electron for the desktop shell.
- Built-in Node modules for networking and filesystem operations.
- A lightweight JSON database for persistence.
- Optional keychain integration for secure secret storage.
- TypeScript, ESLint/Prettier, test runners, and end-to-end testing tools.
- No heavy UI framework is required; keep styling accessible and consistent.

## External Libraries Policy (REQUIRED)
- Default stance: **avoid external libraries** unless explicitly allow-listed here.
- Allowed (minimal) set for functionality and security:
  - **Persistence:** a lightweight JSON DB (e.g., lowdb) or an equivalent small-footprint alternative.
  - **Keychain:** OS keychain integration (e.g., keytar) when secure storage is enabled.
  - **MIME/types & multipart utilities:** minimal utilities for content-type detection and multipart/form-data encoding.
- Any additional dependency must be **justified**, lightweight, actively maintained, and security-reviewed. No telemetry/analytics dependencies. No runtime CDN-loaded code.

## IPC Contract (REQUIRED)
- Use **named, whitelisted channels** only. No dynamic channel names.
- Group channels by concern (store, networking, OAuth, files). Each channel must validate input and output against shared types.
- The preload bridge must expose **frozen objects** that map exactly to the whitelisted channels.
- The renderer must never access `ipcRenderer` directly.

## Networking Requirements
- Support common HTTP methods and full header control.
- Support body types: JSON, raw text, x-www-form-urlencoded, form-data with file streaming, and binary file upload.
- Auto-set sensible `Content-Type` per body type unless explicitly overridden by the user.
- Implement redirect handling (limited hops) and respect a user toggle for following redirects.
- Implement request **abort** by ID.
- Enforce TLS verification by default; allow opt-in insecure mode per request.
- Support optional proxy and basic cookie jar behavior.
- Return structured results with status, headers, body, timings, final URL, and redirect chain.

## OAuth 2.0 / OIDC Requirements
- Support Discovery from issuer to prefill endpoints and scopes.
- Implement Client Credentials, Authorization Code (with PKCE), Device Code, and Refresh Token flows.
- Store secrets/tokens in the OS keychain when enabled; otherwise persist minimal required metadata.
- Allow token placement in Authorization header (default) or as a query parameter.
- Provide token metadata (expiry, scopes) and a decoded claims view for JWTs.
- **Automatic refresh:** attempt silent refresh on expiry or 401 **only if** refresh configuration is present and user has enabled it. Do not initiate interactive consent flows without explicit user action. Surface token status in UI.

## Security
- Enforce strict Content Security Policy.
- Sanitize or escape any HTML rendered from untrusted content.
- Disable remote module usage and any insecure web preferences.
- Never expose wildcard invocation from preload; do not leak file paths or secrets to the renderer.
- Provide a global debug switch for logs; always redact sensitive values.
- Do not include third-party telemetry or tracking. Do not load code from remote CDNs.

## Renderer UX (Acceptance)
- **Body Editor:** distinct sub-tabs for JSON, Raw, x-www-form-urlencoded, form-data, and Binary; live validation; beautify/minify where applicable; file chooser with size/MIME display; automatic header sync that respects manual overrides.
- **Auth Panel:** grant-specific fields; issuer discovery; scope chips; token status with expiry countdown; header/query placement; inheritance from collection with clear override indicators.
- **Response Panel:** pretty/raw/headers views; format badge; search; enlarge; export via native dialog; remember last selected sub-view per tab.
- **Collections/Environments/History:** fast search/filter; drag-reorder; inline rename; quick environment switch.
- **Shortcuts:** send, cancel, and global search. Persist per-tab UI preferences.

## Guidelines for Code Changes
- Prioritize **security**, **correctness**, and **user experience** over shortcuts.
- Maintain backward-compatible IPC and data shapes unless a deliberate migration is specified.
- Keep commits small and scoped to a single concern.
- Do not introduce new persistence paths or bypass the main-process store.
- Adhere to the architectural boundaries, typing, and file size limits.
- When adding features, update tests, types, and documentation in the same change.

## Implementation Order
- Scaffold the modular structure and build tooling.
- Implement persistence with schema and write-queue.
- Implement preload bridge with whitelisted APIs.
- Implement the networking engine.
- Wire IPC across persistence, networking, OAuth, and file dialogs.
- Build the minimal renderer experience for API requests.
- Add unit and smoke tests, then iterate on UX polish.

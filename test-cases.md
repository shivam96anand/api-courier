# Restbro — Test Cases Implementation Plan

## Overview

This document is the complete, actionable guide for implementing test coverage across the Restbro codebase. The goal is a stable regression suite that catches breaking changes before they reach production.

**Test runner:** Vitest v1  
**Config:** `vitest.config.ts` (environment: `node`, globals: `true`)  
**Test file pattern:** `src/**/__tests__/**/*.test.ts`  
**Run tests:** `npm test`

---

## Testing Strategy

### Tier 1 — Pure Logic (No Electron, no I/O)
These can be tested directly with no mocking. Start here.

| Module | Test file |
|---|---|
| `src/main/modules/importers/index.ts` | `src/main/modules/importers/__tests__/importer.test.ts` |
| `src/main/modules/importers/postman.ts` | `src/main/modules/importers/__tests__/postman.test.ts` |
| `src/main/modules/importers/insomnia.ts` | `src/main/modules/importers/__tests__/insomnia.test.ts` |

### Tier 2 — Stateful Main-Process Modules (requires mocking `fs` / `electron`)
| Module | Test file |
|---|---|
| `src/main/modules/store-manager.ts` | `src/main/modules/__tests__/store-manager.test.ts` |
| `src/main/modules/loadtest-engine.ts` | `src/main/modules/__tests__/loadtest-engine.test.ts` |
| `src/main/modules/oauth.ts` | `src/main/modules/__tests__/oauth.test.ts` |

### Tier 3 — Integration (Electron IPC, full request pipeline)
These are the hardest to isolate; implement after Tier 1 is solid.

| Module | Test file |
|---|---|
| `src/main/modules/request-manager.ts` | `src/main/modules/__tests__/request-manager.test.ts` |
| `src/main/modules/ipc-manager.ts` | `src/main/modules/__tests__/ipc-manager.test.ts` |

---

## Mocking Conventions

### Mocking Electron in Vitest

Create a shared mock at `src/__mocks__/electron.ts` to be auto-resolved by Vitest:

```ts
// src/__mocks__/electron.ts
export const app = {
  getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
  on: vi.fn(),
};
export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
};
export const BrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn(),
  on: vi.fn(),
  webContents: { send: vi.fn(), on: vi.fn() },
  close: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
}));
export const dialog = {
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
};
export const shell = { openExternal: vi.fn() };
```

Add `vi.mock('electron')` at the top of any test file that imports a module which imports `electron`.

### Mocking `fs/promises` for StoreManager

```ts
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
```

---

## Tier 1 Test Cases

---

### 6. `importers/index.ts` — `detectAndParse` and `generatePreview`

**File:** `src/main/modules/importers/__tests__/importer.test.ts`

```
detectAndParse — Postman collection
  ✓ identifies Postman v2.1 collection (schema url contains 'v2.1')
  ✓ returns kind 'postman-collection'
  ✓ returned rootFolder.name matches collection info.name
  ✓ environments is an empty array when no variables present

detectAndParse — Postman environment
  ✓ identifies Postman environment by presence of 'values' array
  ✓ returns kind 'postman-environment'
  ✓ environments array has one item with correct name

detectAndParse — Insomnia V4
  ✓ identifies Insomnia V4 by _type === 'export' and __export_format === 4
  ✓ returns kind 'insomnia'
  ✓ rootFolder is populated

detectAndParse — Insomnia V5
  ✓ identifies Insomnia V5 format
  ✓ returns kind 'insomnia'

detectAndParse — unknown format
  ✓ returns kind 'unknown' for arbitrary object
  ✓ environments is []

generatePreview
  ✓ counts folders correctly
  ✓ counts requests correctly
  ✓ counts environments correctly
  ✓ summary.folders + summary.requests reflects full nested tree
```

---

### 7. `importers/postman.ts`

**File:** `src/main/modules/importers/__tests__/postman.test.ts`

Use a fixture Postman JSON (minimal v2.1 collection) to drive these:

```
mapPostmanCollection — structure
  ✓ root Collection has type 'folder'
  ✓ nested folder item creates child Collection of type 'folder'
  ✓ request item creates child Collection of type 'request'
  ✓ request's method is mapped correctly
  ✓ string URL is preserved as url field on ApiRequest
  ✓ PostmanUrl object: raw URL is used
  ✓ disabled headers are excluded
  ✓ enabled headers are included
  ✓ raw body is mapped to body.content with type 'json' or 'text'
  ✓ urlencoded body is mapped to body.type 'form-urlencoded'
  ✓ order field increments per sibling (1000, 2000, ...)

mapPostmanEnvironment
  ✓ returns Environment with id, name, variables
  ✓ only enabled variables are included
  ✓ disabled variables are excluded
```

---

### 8. `importers/insomnia.ts`

**File:** `src/main/modules/importers/__tests__/insomnia.test.ts`

Use minimal Insomnia V4/V5 fixtures:

```
mapInsomniaExport — V4
  ✓ creates root folder matching workspace name
  ✓ maps request groups as folder Collections
  ✓ maps requests as request Collections
  ✓ url is preserved
  ✓ headers are mapped (enabled/disabled respected)
  ✓ auth is mapped through mapAuth

mapInsomniaExport — V5
  ✓ reads requests and environments from V5 format
  ✓ environments are mapped

isInsomniaExport
  ✓ returns true for V4 export payload
  ✓ returns true for V5 export payload
  ✓ returns false for Postman payload
  ✓ returns false for null/undefined
```

---

## Tier 2 Test Cases

---

### 9. `store-manager.ts`

**File:** `src/main/modules/__tests__/store-manager.test.ts`

Mock: `electron` (`app.getPath`), `fs/promises` (`readFile`, `writeFile`, `mkdir`)

```
StoreManager — initialize
  ✓ creates database file if it does not exist (readFile throws ENOENT)
  ✓ loads and parses existing valid JSON
  ✓ merges loaded data into defaultState (missing keys get defaults)
  ✓ handles corrupted JSON file gracefully (falls back to defaultState)

StoreManager — getState
  ✓ returns current in-memory state
  ✓ state matches defaultState on fresh init

StoreManager — setState
  ✓ merges updates into state (partial update)
  ✓ queues a debounced write to disk
  ✓ flush() writes immediately without waiting for debounce
  ✓ sanitizes response body before persisting (large body not written)

StoreManager — migrations / backward-compat
  ✓ file missing 'environments' key gets defaultState.environments ([])
  ✓ file missing 'globals' key gets defaultState.globals
  ✓ file missing 'mockServers' key gets defaultState.mockServers ([])
  ✓ existing data is preserved after merge
```

---

### 10. `loadtest-engine.ts`

**File:** `src/main/modules/__tests__/loadtest-engine.test.ts`

Mock: HTTP/HTTPS requests (use `nock` or mock `https.request`)

```
LoadTestEngine — startLoadTest validation
  ✓ throws if totalPlanned rounds to 0 (rpm too low for durationSec)
  ✓ emits 'progress' events during run
  ✓ emits 'summary' event when run completes

LoadTestEngine — cancellation
  ✓ cancelLoadTest stops further scheduling
  ✓ flush on cancel: dispatches remaining unscheduled requests to meet totalPlanned
  ✓ cancelLoadTest on unknown runId does not throw

LoadTestEngine — concurrency
  ✓ does not exceed MAX_CONCURRENT_REQUESTS (32) in flight at once

LoadTestEngine — summary metrics
  ✓ summary.totalRequests equals totalPlanned
  ✓ summary contains p50, p95, p99 latency fields
  ✓ summary.throughput is requests per second
  ✓ summary.errorRate reflects failed requests / total
```

---

### 11. `oauth.ts`

**File:** `src/main/modules/__tests__/oauth.test.ts`

Mock: `electron` (`BrowserWindow`, `app`), `https` for token exchange

```
OAuthManager — getTokenInfo
  ✓ returns { isValid: true } when token is present and not expired
  ✓ returns { isValid: false } when token is absent
  ✓ returns { isValid: false } when token is expired (expiresAt < now)
  ✓ returns expiresIn as seconds remaining

OAuthManager — refreshToken
  ✓ throws if no refreshToken provided in config
  ✓ calls token endpoint with grant_type=refresh_token
  ✓ returns updated OAuthTokenResponse on success
  ✓ throws descriptive error on HTTP 400 from token endpoint

OAuthManager — client credentials flow
  ✓ calls token endpoint with grant_type=client_credentials
  ✓ returns access token on success
  ✓ returns error details on failure

OAuthManager — PKCE state validation
  ✓ auth code flow generates and validates state parameter
  ✓ rejects redirect if state does not match (security check)
  ✓ cleans up auth window on success
  ✓ cleans up auth window on cancellation/error
```

---

## Tier 3 Test Cases

---

### 12. `request-manager.ts`

**File:** `src/main/modules/__tests__/request-manager.test.ts`

Mock: `electron`, `store-manager` (returns fake state), real or nocked HTTP

```
RequestManager — variable resolution
  ✓ resolves env vars in URL before making request
  ✓ resolves folder vars in URL
  ✓ returns error when URL has unresolved variables (scanUnresolvedVars check)
  ✓ unresolved var error response has status 400

RequestManager — auth handling
  ✓ oauth2 refresh is triggered when token is expired
  ✓ oauth2 refresh is NOT triggered when token is valid

RequestManager — cancellation
  ✓ cancelRequest(id) aborts in-flight request
  ✓ cancelRequest on unknown id does not throw

RequestManager — response shape
  ✓ successful response has: status, statusText, headers, body, time, size
  ✓ network error returns structured error body (from RequestErrorFormatter)
  ✓ time field is a positive number in milliseconds

RequestManager — HTTP methods
  ✓ sends GET request
  ✓ sends POST with body
  ✓ sends PUT with body
  ✓ sends DELETE
```

---

### 13. `ipc-manager.ts`

**File:** `src/main/modules/__tests__/ipc-manager.test.ts`

Mock: `electron` (`ipcMain.handle`), all module dependencies (storeManager, requestManager, etc.)

```
IpcManager — registration
  ✓ registers handlers for all channels defined in IPC_CHANNELS
  ✓ does not register duplicate handlers

IpcManager — store:get
  ✓ returns full state from storeManager

IpcManager — store:set
  ✓ calls storeManager.setState with provided updates

IpcManager — collection:create
  ✓ assigns a UUID id to new collection
  ✓ calculates order as max sibling order + 1000
  ✓ sets createdAt and updatedAt timestamps
  ✓ creates a default ApiRequest if request field not provided

IpcManager — collection:update
  ✓ updates matching item and sets updatedAt
  ✓ returns updated collections array

IpcManager — collection:delete
  ✓ removes item by id from collections array
  ✓ cascades deletion to children of deleted folder

IpcManager — request:send
  ✓ delegates to requestManager.sendRequest

IpcManager — request:cancel
  ✓ delegates to requestManager.cancelRequest
```

---

## Fixture Files

Place shared test fixtures under `src/main/modules/importers/__tests__/fixtures/`.

### `postman-collection-v21.json` — Minimal Postman v2.1 Collection

```json
{
  "info": {
    "name": "Test Collection",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Hello Request",
      "request": {
        "method": "GET",
        "url": "https://example.com/api/hello",
        "header": [
          { "key": "X-Custom", "value": "test", "disabled": false }
        ]
      }
    },
    {
      "name": "Sub Folder",
      "item": [
        {
          "name": "Nested Request",
          "request": {
            "method": "POST",
            "url": { "raw": "https://example.com/api/data" },
            "body": { "mode": "raw", "raw": "{\"key\": \"value\"}" }
          }
        }
      ]
    }
  ]
}
```

### `postman-environment.json` — Minimal Postman Environment

```json
{
  "name": "Staging",
  "values": [
    { "key": "base_url", "value": "https://staging.example.com", "enabled": true },
    { "key": "secret", "value": "hidden", "enabled": false }
  ]
}
```

### `insomnia-v4.json` — Minimal Insomnia V4 Export

```json
{
  "_type": "export",
  "__export_format": 4,
  "__export_date": "2024-01-01T00:00:00.000Z",
  "resources": [
    { "_id": "wrk_1", "_type": "workspace", "name": "My API" },
    { "_id": "req_1", "_type": "request", "parentId": "wrk_1",
      "name": "Get Users", "method": "GET", "url": "https://api.example.com/users",
      "headers": [{ "name": "Accept", "value": "application/json" }],
      "authentication": {} }
  ]
}
```

---

## Implementation Order (Priority)

1. **`request-builder.ts`** — critical for request correctness, especially auth handling.
2. **`request-error-formatter.ts`** — straightforward, quick wins for error path coverage.
3. **`system-variables.ts`** — validates random data generators work correctly.
4. **`importers/mappers.ts`** + **`importers/postman.ts`** — protects import pipeline.
5. **`importers/insomnia.ts`** + **`importers/index.ts`** — completes import coverage.
6. **`store-manager.ts`** — validates persistence and migration safety.
7. **`loadtest-engine.ts`** — protects load testing correctness.
8. **`oauth.ts`** — protects token flows and security (state validation).
9. **`request-manager.ts`** — end-to-end request flow.
10. **`ipc-manager.ts`** — validates IPC contract correctness.

---

## Coverage Goals

| Tier | Target coverage |
|---|---|
| Tier 1 (pure logic) | 90%+ line coverage |
| Tier 2 (stateful) | 70%+ line coverage |
| Tier 3 (integration) | 50%+ line coverage |

Enable coverage with: `npx vitest run --coverage`

---

## Notes on What NOT to Test

- **Renderer components** (`src/renderer/**`) — these are DOM-heavy vanilla TS managers. Testing them would require a browser environment (jsdom) and extensive DOM fixture setup. The ROI is low; test via visual/manual QA or Playwright E2E instead.
- **`ai-engine.ts`** — depends on a local LLM server at `localhost:9999`. Integration-test only when the server is running; not worth unit-testing the streaming infrastructure without a real server.
- **`window-manager.ts`** — pure Electron BrowserWindow instantiation; no business logic to assert.
- **`loadtest-export.ts`** — depends on Electron's `dialog.showSaveDialog` and file I/O; the logic of CSV/PDF generation is a reasonable candidate if you want to extract `generateCsvContent` as a pure function first.

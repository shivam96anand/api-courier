# Restbro Architecture

## Process Model

Restbro is an Electron app with three isolated process layers. The renderer never has direct access to Node.js or the file system — all privileged operations go through IPC.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electron Application                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │              │    │              │    │                       │  │
│  │  Main Process│◄──►│   Preload    │◄──►│   Renderer Process    │  │
│  │  (Node.js)   │IPC │  (Bridge)    │API │   (Browser)           │  │
│  │              │    │              │    │                       │  │
│  └──────┬───────┘    └──────────────┘    └───────────┬───────────┘  │
│         │                                            │              │
│         ▼                                            ▼              │
│  ┌──────────────┐                         ┌───────────────────────┐ │
│  │ File System  │                         │  DOM / UI             │ │
│  │ Network      │                         │  (Vanilla TS +        │ │
│  │ database.json│                         │   React islands)      │ │
│  │ OS APIs      │                         │                       │ │
│  └──────────────┘                         └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
  Renderer                    Preload                     Main
  ────────                    ───────                     ────

  User clicks "Send"
        │
        ▼
  window.restbro              contextBridge
  .request.send(req) ──────►  ipcRenderer.invoke() ──────► ipc-manager.ts
                                                                 │
                                                                 ▼
                                                          request-builder.ts
                                                          (resolve variables,
                                                           build headers)
                                                                 │
                                                                 ▼
                                                          request-engine.ts
                                                          (Node http/https)
                                                                 │
                                                                 ▼
                                                          Format response
                                                                 │
                              contextBridge                      │
  Update response UI ◄──────  returns result  ◄─────────────────┘
```

## Security Model

```
  Renderer (sandboxed)          Preload                   Main (trusted)
  ────────────────────          ───────                   ──────────────
  ✗ No Node.js APIs             Whitelisted               ✓ Full Node.js
  ✗ No require/import           IPC channels              ✓ File system
  ✗ No file system              only                      ✓ Network requests
  ✗ No localStorage                                       ✓ database.json
    for persistence                                       ✓ OS integration
        │                                                       ▲
        └───── window.restbro.* (typed API) ────────────────────┘
                    Only entry point
```

Settings enforced:
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

## Directory Structure

```
src/
├── main/                    # Main process (Node.js)
│   ├── index.ts             # App boot, window creation, lifecycle
│   └── modules/             # One module per concern (≤300 lines each)
│       ├── ipc-manager.ts       # IPC handler registration
│       ├── store-manager.ts     # Persistence (database.json, debounced writes)
│       ├── request-builder.ts   # Request assembly + variable resolution
│       ├── request-engine.ts    # HTTP execution via Node http/https
│       ├── request-manager.ts   # Request lifecycle orchestration
│       ├── variables.ts         # Variable resolution (req > env > folder > global)
│       ├── oauth.ts             # OAuth 2.0 flows
│       ├── ai-engine.ts         # LLM integration
│       ├── curl-executor.ts     # cURL import/execution
│       ├── loadtest-engine.ts   # Performance testing
│       ├── loadtest-export.ts   # CSV/PDF export
│       ├── jks-parser.ts        # SSL/TLS certificate parsing
│       ├── update-manager.ts    # Auto-update
│       ├── window-manager.ts    # Window lifecycle
│       ├── mock-server/         # Mock server subsystem
│       └── importers/           # Postman/Insomnia/API Courier import
│
├── preload/                 # Preload scripts (bridge layer)
│   └── index.ts             # contextBridge → window.restbro.* API (~50 methods)
│
├── renderer/                # Renderer process (browser context)
│   ├── index.ts             # Manager initialization and orchestration
│   ├── event-listeners.ts   # Central event hub for DOM events
│   ├── components/          # UI components organized by feature
│   │   ├── app-manager.ts       # App shell
│   │   ├── tabs-manager.ts      # Tab management
│   │   ├── collections/         # Collection tree UI
│   │   ├── request/             # Request editor, auth, body, variables
│   │   │   └── editors/         # Header/Params/Form editors
│   │   ├── response-viewer/     # Response display + search
│   │   ├── environments/        # Environment variable management
│   │   ├── loadtest/            # Load testing UI
│   │   ├── mock-server/         # Mock server UI
│   │   ├── ask-ai/              # AI chat UI
│   │   ├── json-viewer/         # JSON formatting/parsing/search
│   │   ├── notepad/             # Notepad feature
│   │   ├── import/              # Import dialogs
│   │   └── tabs/                # Tab state + rendering
│   ├── utils/               # Shared utilities (theme, modals, icons)
│   ├── types/               # Renderer-specific type definitions
│   └── styles/              # SCSS stylesheets
│
├── shared/                  # Shared between main and renderer
│   ├── types.ts             # Core domain types (Collection, ApiRequest, ApiResponse)
│   ├── ipc.ts               # IPC channel constants (single source of truth)
│   └── system-variables.ts  # System variable helpers ({{timestamp}}, etc.)
│
└── features/                # Standalone feature modules
    └── json-compare/        # JSON diff tool (React + Web Workers)
```

## State Management

Restbro uses an IPC-based state model — no Redux, Zustand, or other state library.

```
  Renderer                           Main Process
  ────────                           ────────────
  Manager classes                    StoreManager
  (in-memory UI state)               │
        │                            ├── database.json (persistent state)
        │                            ├── Debounced writes
        ▼                            ├── flush() on shutdown
  window.restbro.store.get() ──────► │
  window.restbro.store.set() ──────► │
```

- **Persistent state** (collections, requests, environments, settings) → `StoreManager` in main process → `database.json`
- **Transient UI state** (open panels, scroll positions) → vanilla TS manager classes in renderer
- **No localStorage** for persistence — all goes through IPC to main

## Adding a New Feature

1. Define types in `src/shared/types.ts`
2. Add IPC channel constants in `src/shared/ipc.ts`
3. Implement the handler in `src/main/modules/ipc-manager.ts`
4. Expose the typed API in `src/preload/index.ts` under `window.restbro.*`
5. Build the renderer UI in `src/renderer/components/<feature>/`

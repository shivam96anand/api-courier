# API Courier - Claude CLI Instructions

This is an Electron desktop application for API testing, competing with Postman and Insomnia.

## Project Overview

API Courier is a secure, modular Electron app built with TypeScript that provides comprehensive API testing capabilities including HTTP requests, collections, environments, authentication (including OAuth 2.0/OIDC), and response visualization.

## Architecture & File Organization

### Main Process (`src/main/`)
- **Modular TypeScript architecture** - Split by concern into small modules
- **File size limit**: Maximum ~300 lines per file
- **Required modules**:
  - `bootstrap.ts` - Application initialization
  - `windows.ts` - Window management
  - `ipc.ts` - Inter-process communication handlers
  - `persistence.ts` - Data storage utilities
  - `request-engine.ts` - HTTP request handling
  - `oauth.ts` - OAuth/OIDC authentication
  - `file-dialogs.ts` - Native file operations
  - `logging.ts` - Centralized logging

### Preload Script (`src/preload/`)
- **Security-focused bridge** between main and renderer
- **Whitelist-only APIs** - No generic invoke or wildcard channels
- **Frozen objects** mapping to specific IPC channels
- Must validate all input/output against shared types

### Renderer Process (`src/renderer/`)
- **HTML/CSS/TypeScript UI** with strict security:
  - `contextIsolation: true`
  - `nodeIntegration: false` 
  - `sandbox: true`
- Never access `ipcRenderer` directly
- All file operations through IPC only

## Core Features Requirements

### HTTP Request Testing
- Support: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Full header control with auto-Content-Type setting
- Body types: JSON, Raw, x-www-form-urlencoded, form-data, binary
- Redirect handling with user toggle
- Request abort by ID
- TLS verification (default on, opt-in insecure)
- Proxy support and basic cookie jar

### Data Organization
- Request collections with drag-reorder
- Environment variables with quick switching  
- Request history with search/filter
- Import/Export (Postman/Insomnia compatibility)

### Authentication Support
- None, Basic, Bearer, API Key
- **OAuth 2.0/OIDC flows**:
  - Authorization Code with PKCE
  - Client Credentials  
  - Device Code
  - Refresh Token
  - Discovery endpoint support
  - Automatic token refresh (user-enabled only)

### Response Handling
- Pretty/Raw/Headers views with format detection
- Response search and export via native dialogs
- Timing information and redirect chains

## Critical Persistence Rules

⚠️ **NEVER use `window.localStorage`** - All data must persist through main process

### Required Persistence Strategy
- **Disk-backed JSON database** in app's user data directory
- **Write queue/debounce** with flush on app exit
- **Main process only** - renderer accesses via IPC
- **Schema validation** before writes
- **Optional secure storage** using OS keychain for secrets/tokens

### Data Types to Persist
- Request tabs and collections
- Environment configurations
- Request history
- Application settings
- Response metadata (not full responses)
- Authentication tokens (keychain preferred)

## Development Standards

### Code Quality
- **TypeScript everywhere** (main, preload, renderer)
- **ESLint + Prettier** with pre-commit hooks
- **File size limits**: 150-300 lines for components, max 300 for main process modules
- **Unit tests** for pure logic, **smoke tests** for user flows
- **Clear naming** and small, pure functions
- **Async/await** with structured error handling

### Security Requirements
- **Strict CSP** enforcement
- **No remote code loading** or CDN dependencies
- **Secret redaction** in all logs and UI
- **Input sanitization** for untrusted content
- **Minimal external dependencies** (see approved list below)

## External Dependencies Policy

### Approved Dependencies Only
- **Persistence**: Lightweight JSON DB (lowdb or similar)
- **Keychain**: OS integration (keytar when secure storage enabled)
- **Utilities**: Minimal MIME/multipart utilities only
- **Dev tools**: TypeScript, ESLint, Prettier, test runners

### Forbidden
- Heavy UI frameworks
- Telemetry/analytics libraries
- Runtime CDN-loaded code
- Generic HTTP clients with excessive features

## IPC Architecture

### Channel Requirements
- **Named, whitelisted channels only** - no dynamic names
- **Grouped by concern**: `store:*`, `network:*`, `oauth:*`, `files:*`
- **Input/output validation** against shared TypeScript types
- **Documentation required**: purpose, shapes, error cases

### Example Channel Groups
```typescript
// Store operations
'store:get-collections'
'store:save-request'
'store:get-environments'

// Network operations  
'network:send-request'
'network:abort-request'
'network:get-history'

// OAuth operations
'oauth:start-flow'
'oauth:refresh-token'
'oauth:get-token-info'

// File operations
'files:export-collection'
'files:save-response'
```

## UI/UX Requirements

### Request Builder
- **Body editor tabs**: JSON, Raw, form-urlencoded, form-data, Binary
- **Live validation** with beautify/minify
- **File chooser** with size/MIME display
- **Automatic header sync** respecting manual overrides

### Authentication Panel
- **Flow-specific fields** with issuer discovery
- **Scope management** with chip UI
- **Token status** with expiry countdown
- **Inheritance indicators** from collection settings

### Response Viewer
- **Multi-view tabs**: Pretty, Raw, Headers
- **Format detection badge**
- **Search functionality** within responses
- **Export via native dialogs**
- **Per-tab view preferences** persistence

### Navigation & Shortcuts
- **Global shortcuts**: Send (Cmd/Ctrl+Enter), Cancel (Esc)
- **Fast search/filter** across collections/history
- **Drag-and-drop reordering**
- **Inline rename** capabilities

## Implementation Priorities

1. **Foundation**: Modular architecture + build tooling
2. **Data Layer**: Persistence with schema + write queue  
3. **Security**: Preload bridge with whitelisted APIs
4. **Core Engine**: HTTP networking with full feature set
5. **Integration**: IPC wiring for all subsystems
6. **UI Foundation**: Basic renderer for API requests
7. **Testing**: Unit tests + smoke tests
8. **Polish**: Advanced UX features and optimizations

## Development Workflow

### Before Each Commit
- Run `npm run build` (mandatory)
- Execute lint/format via pre-commit hooks
- Ensure tests pass
- Validate no new security vulnerabilities

### Code Review Checklist
- Architectural boundaries respected?
- File size limits maintained?
- IPC contracts properly defined?
- Secrets properly redacted?
- TypeScript types complete?
- Tests updated for changes?

## Common Patterns to Follow

### Error Handling
```typescript
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error: redactSecrets(error) });
  return { success: false, error: error.message };
}
```

### IPC Type Safety
```typescript
// shared/types.ts
export interface SendRequestParams {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: RequestBody;
}

export interface SendRequestResponse {
  success: boolean;
  data?: HttpResponse;
  error?: string;
}
```

### State Management
```typescript
// Immutable updates in renderer
const updatedState = {
  ...currentState,
  requests: currentState.requests.map(req => 
    req.id === targetId ? { ...req, ...updates } : req
  )
};
```

Remember: **Security, correctness, and user experience** are the top priorities. When in doubt, choose the more secure, maintainable approach over shortcuts.
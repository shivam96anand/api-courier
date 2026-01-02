# API Courier

A modern, professional API testing tool built with Electron, TypeScript, and modern web technologies. API Courier is a secure, feature-rich desktop application that provides comprehensive API testing, automation, and development tools — all in one place.

## Overview

API Courier combines the best features of tools like Postman and Insomnia with powerful additions like load testing, mock servers, AI assistance, and advanced JSON tools. Built with security-first architecture and enterprise-grade practices, API Courier is designed for developers who need a reliable, fast, and comprehensive API testing solution.

## Key Features

### 🚀 Core API Testing

- **Full HTTP Method Support**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Advanced Request Builder**:
  - URL with dynamic variable resolution `{{variable}}`
  - Query parameters editor
  - Headers editor with key-value pairs
  - Multiple body types: JSON, Raw text, Form data, Form URL-encoded
  - Request validation and formatting
- **Smart Response Viewer**:
  - Auto-formatted JSON with syntax highlighting
  - Collapsible/expandable JSON nodes with state persistence
  - Headers display in table format
  - Response metadata (status code, time, size, timestamp)
  - Powerful search with regex support and navigation
  - Multiple view modes: Pretty, Raw, Headers
  - Export responses (JSON, Text, CSV)
  - Fullscreen mode
  - Copy to clipboard
- **Request Tabs**: Multi-request workflow with tab management
- **Request History**: Track all requests with timestamp, method, URL, and ability to reload

### 📁 Organization & Collections

- **Hierarchical Collections**: Organize requests in nested folders with unlimited depth
- **Folder-Level Variables**: Scope variables to folders and inherit through folder chains
- **Drag-and-Drop Ordering**: Arrange collections and folders
- **Context Menus**: Quick access to rename, delete, duplicate operations
- **Expanded/Collapsed State**: Folder state persistence across sessions

### 🔐 Authentication

- **Basic Auth**: Username and password
- **Bearer Token**: Token-based authentication
- **API Key**: Custom header or query parameter
- **OAuth 2.0** (Full implementation):
  - Authorization Code flow with PKCE
  - Client Credentials flow
  - Device Code flow
  - Automatic token refresh
  - Token expiration tracking
  - Secure auth window handling

### 🌍 Environments & Variables

- **Multiple Environments**: Create and switch between different environments
- **Environment Variables**: Environment-scoped variable management
- **Global Variables**: Workspace-wide variables
- **Variable Precedence**: Request → Environment → Folder → Global
- **Variable Resolution**: Supports `{{var}}` syntax with default values `{{var:default}}`
- **System Variables**: Built-in timestamp and dynamic variables
- **Variable Highlighting**: Visual indicators in URL, headers, and body fields

### 🧪 Load Testing

- **RPM-Based Testing**: Configure requests per minute (RPM)
- **Configurable Duration**: Set test duration in seconds
- **Two Target Types**:
  - Load test from saved collection requests
  - Ad-hoc load test with custom configuration
- **Real-Time Metrics**:
  - Scheduled, sent, completed, in-flight request counts
  - Elapsed time tracking
  - Progress indicators
- **Performance Analytics**:
  - Min/Max/Avg response times
  - Percentiles: p50, p95, p99
  - Response status code distribution
  - Throughput (requests per second)
- **Export Results**:
  - CSV export with all samples
  - PDF export with summary report and charts
- **Token Bucket Algorithm**: Accurate rate limiting
- **Cancellation Support**: Stop tests mid-execution

### 🔧 Mock Server

- **Multiple Mock Servers**: Create and manage multiple server instances
- **Flexible Configuration**:
  - Custom host (default: 127.0.0.1)
  - Dynamic port selection
- **Advanced Route Matching**:
  - Exact path match
  - Prefix match
  - Wildcard patterns (`*` for single segment, `**` for multiple)
  - Regex patterns
- **Rich Response Options**:
  - Custom status codes
  - Custom response headers
  - Response body (JSON, text, binary, file)
  - Configurable response delays
  - File-based responses
- **Route Management**:
  - Enable/disable individual routes
  - Multiple HTTP methods per route
- **Runtime Control**: Start/stop servers with status tracking

### 📊 JSON Tools

- **JSON Viewer**:
  - Syntax highlighting with Monaco editor
  - Collapsible/expandable nodes
  - Search within JSON structures
  - Copy individual values
  - Expand/collapse all shortcuts
  - Node expansion state persistence (LRU cache)

- **JSON Compare**:
  - Side-by-side JSON comparison
  - Diff highlighting (added, removed, modified)
  - Change statistics
  - Filterable results
  - Web worker-based processing (non-blocking UI)
  - Interactive React component

### 🤖 Ask AI

- **AI-Powered Assistant**: Qwen 2.5 7B model via local LLM server
- **Session Management**:
  - Multiple chat sessions
  - Session history persistence
  - Session renaming and deletion
- **Contextual Intelligence**:
  - Use current request as context
  - Use current response as context
  - File upload support
- **Streaming Responses**: Real-time AI response generation
- **Context Size Management**: Automatic validation (12,000 char limit)
- **Quick Suggestions**: Pre-built prompts for common tasks

### 📝 Notepad

- **Multi-Tab Editor**: Multiple file tabs with Monaco editor
- **File Operations**:
  - Open files from disk
  - Save and Save As
  - Auto-save prompts on exit
- **Editor Features**:
  - Syntax highlighting
  - Line numbers
  - Word wrap
  - Font size adjustment (zoom in/out)
  - Cursor position tracking
- **Keyboard Shortcuts**:
  - `Cmd/Ctrl+S`: Save
  - `Cmd/Ctrl+O`: Open file
  - `Cmd/Ctrl+N`: New tab
  - `Cmd/Ctrl+W`: Close tab
  - `Cmd/Ctrl+Tab`: Next tab
  - `Cmd/Ctrl+Shift+Tab`: Previous tab
- **Smart Tab Management**: Dirty state detection, unsaved changes prompts

### 📥 Import/Export

- **Import Support**:
  - Postman Collections (v2.1)
  - Postman Environments
  - Insomnia Exports (v4 and v5)
- **Import Features**:
  - File preview before import
  - Automatic format detection
  - Collections and environments import
  - Folder structure preservation
  - Variable mapping
- **Export Options**:
  - Export responses (JSON, Text, CSV)
  - Export load test results (CSV, PDF)

### 🎨 Themes & UI

- **Color Themes**: Blue, Green, Purple, Orange, Red, Magenta
- **Persistent Preferences**: Theme selection saved across sessions
- **Resizable Panels**: Drag-to-resize layout
- **Responsive Design**: Adaptive to different screen sizes
- **Clean Interface**: Minimal, professional design

## Getting Started

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Latest version
- **(Optional) Local LLM Server**: For AI features, run a compatible server at `http://localhost:9999` (Qwen 2.5 7B recommended)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd api-courier
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the application**:
   ```bash
   npm run build
   ```

4. **Start the application**:
   ```bash
   npm start
   ```

### Development

For development with hot reload:

```bash
npm run dev
```

This will:
- Start the webpack dev server for the renderer process
- Watch for file changes in the main process
- Enable hot module replacement (HMR)

### Build Commands

- `npm run build` - Build all processes (main, preload, renderer)
- `npm run build:main` - Build main process only
- `npm run build:preload` - Build preload script only
- `npm run build:renderer` - Build renderer process only
- `npm run clean` - Remove all build artifacts
- `npm run rebuild` - Clean and rebuild all
- `npm run fresh` - Rebuild and start application

### Development Workflow

1. Run `npm run dev` for development
2. Make changes to source files in `src/`
3. Changes to renderer will hot-reload automatically
4. Changes to main/preload require restart (Cmd/Ctrl+R in dev tools)

## Architecture

API Courier is built with **security-first architecture** following Electron security best practices:

### Security Model

- **Context Isolation**: `contextIsolation: true` - Renderer cannot access Node/Electron APIs directly
- **Sandbox Mode**: `sandbox: true` - Renderer runs in a restricted environment
- **No Node Integration**: `nodeIntegration: false` - No direct Node.js API access in renderer
- **Explicit IPC**: Whitelisted IPC channels only - No dynamic or generic invocations
- **Main Process Operations**: All file, network, and native operations execute in main process
- **Secret Redaction**: Tokens, passwords, and secrets are never logged or exposed

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Modules (Request, OAuth, AI, LoadTest, Mock, etc.) │  │
│  │  • HTTP/HTTPS Client                                 │  │
│  │  • File System Operations                            │  │
│  │  • Store Manager (database.json)                     │  │
│  │  • IPC Handler (whitelisted channels)                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ IPC (secure bridge)
┌─────────────────────────────────────────────────────────────┐
│                    Preload Script                           │
│  • contextBridge API (window.apiCourier.*)                  │
│  • Type-safe IPC wrapper                                    │
│  • No business logic                                        │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   Renderer Process                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UI Components (Vanilla TS + React Islands)         │  │
│  │  • Collections Manager                               │  │
│  │  • Request Builder                                   │  │
│  │  • Response Viewer                                   │  │
│  │  • Load Test UI                                      │  │
│  │  • Mock Server UI                                    │  │
│  │  • JSON Tools (Monaco Editor)                        │  │
│  │  • AI Chat Interface                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

```
src/
├── main/
│   ├── index.ts           # Main entry point, boot sequence
│   └── modules/
│       ├── request.ts     # HTTP request execution
│       ├── oauth.ts       # OAuth 2.0 flows
│       ├── ai-engine.ts   # AI assistant integration
│       ├── loadtest.ts    # Load testing engine
│       ├── mock-server.ts # Mock server runtime
│       ├── store.ts       # Persistence layer
│       ├── ipc-manager.ts # IPC channel handlers
│       ├── variables.ts   # Variable resolution
│       └── ...            # Other modular services
│
├── preload/
│   └── index.ts           # Secure IPC bridge (contextBridge)
│
├── renderer/
│   ├── components/        # UI managers (vanilla TS)
│   ├── react-components/  # React islands (JSON Compare)
│   ├── styles/            # SCSS stylesheets
│   ├── utils/             # Helper functions
│   └── index.html         # App shell
│
└── shared/
    ├── types.ts           # Shared TypeScript types
    └── ipc.ts             # IPC channel constants
```

### Data Persistence

- **Storage Location**: `app.getPath('userData')/database.json`
- **Write Strategy**: Debounced writes (prevents excessive disk I/O)
- **Graceful Shutdown**: Automatic flush on app exit
- **Migration Strategy**: Additive, backward-compatible migrations
- **State Includes**:
  - Collections and folders
  - Environments and variables
  - Request history
  - UI state (theme, open tabs, expanded folders)
  - Mock server configurations
  - AI chat sessions
  - Notepad content

### Technology Stack

- **Runtime**: Electron 26+, Node.js 18+
- **Language**: TypeScript (strict mode)
- **UI**: Vanilla TypeScript + React (isolated islands)
- **Editors**: Monaco Editor, CodeMirror
- **Build**: Webpack 5, TypeScript Compiler
- **Styling**: SCSS, CSS Modules
- **HTTP Client**: Node.js native `http`/`https` modules
- **Testing**: Vitest
- **Code Quality**: ESLint, Prettier

## Usage Guide

### Quick Start

1. **Creating a Collection**:
   - Click the **"+"** button in the Collections panel
   - Choose **"New Folder"** to create a folder
   - Choose **"New Request"** to create a request
   - Right-click folders for context menu (rename, delete, add subfolder)

2. **Making Your First Request**:
   - Select a request from collections or create a new one
   - Choose HTTP method (GET, POST, etc.)
   - Enter the URL (supports variables like `{{baseUrl}}/api/users`)
   - Add headers, query params, or body as needed
   - Click **"Send"** or press `Cmd/Ctrl+Enter`
   - View response in the right panel

3. **Using Variables**:
   - Create an **Environment** from the top dropdown
   - Add variables (e.g., `baseUrl`, `authToken`)
   - Use in requests: `{{baseUrl}}/api/{{endpoint}}`
   - Set folder-level variables for organization
   - Use **Global Variables** for workspace-wide values

4. **Setting Up Authentication**:
   - Select **Auth** tab in request builder
   - Choose auth type: Basic, Bearer, API Key, or OAuth 2.0
   - For OAuth: Configure grant type, endpoints, and scopes
   - Token refresh is automatic when expired

### Advanced Features

#### Load Testing
1. Navigate to **Load Testing** tab
2. Choose **"From Collection"** or **"Ad-hoc"** test
3. Configure RPM (requests per minute) and duration
4. Click **"Start Load Test"**
5. Monitor real-time metrics
6. Export results as CSV or PDF when complete

#### Mock Server
1. Go to **Mock Server** tab
2. Click **"Create Server"**
3. Add routes with path patterns (exact, wildcard, regex)
4. Configure response body, headers, status codes
5. Click **"Start Server"**
6. Use the server URL in your requests

#### JSON Tools
- **JSON Viewer**: Paste JSON, explore with collapsible nodes, search
- **JSON Compare**: Paste two JSON objects, view side-by-side diff

#### AI Assistant
1. Open **Ask AI** tab
2. Create a new session or select existing
3. Use **"Include Request"** or **"Include Response"** for context
4. Ask questions about API responses, debugging, or general help
5. Get streaming AI responses (requires local LLM server)

#### Notepad
- Click **Notepad** tab
- Use `Cmd/Ctrl+N` for new tab
- `Cmd/Ctrl+O` to open file
- `Cmd/Ctrl+S` to save
- Full Monaco editor with syntax highlighting

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Enter` | Send request |
| `Cmd/Ctrl+S` | Save current (notepad/file) |
| `Cmd/Ctrl+O` | Open file (notepad) |
| `Cmd/Ctrl+N` | New tab (notepad) |
| `Cmd/Ctrl+W` | Close tab |
| `Cmd/Ctrl+Tab` | Next tab |
| `Cmd/Ctrl+Shift+Tab` | Previous tab |
| `Cmd/Ctrl+F` | Find in response |
| `Esc` | Cancel request / Close dialog |

### Importing Collections

1. Click **Import** button in Collections panel
2. Select file type: Postman Collection, Postman Environment, or Insomnia Export
3. Preview the import
4. Click **"Import"**
5. Collections and environments will be added to your workspace

## Best Practices

### Organization
- Use **folders** to group related requests (e.g., Auth, Users, Products)
- Use **nested folders** for complex APIs (e.g., Admin → Users, Admin → Settings)
- Name requests descriptively (e.g., "Get User by ID", "Create New Product")

### Variables
- Use **Environments** for different deployment targets (dev, staging, prod)
- Store base URLs, API keys, and common values in environment variables
- Use **folder variables** for endpoint-specific values
- Use **global variables** for truly cross-cutting values

### Security
- Never commit `database.json` with sensitive tokens
- Use environment variables for secrets
- Rotate API keys and tokens regularly
- Use OAuth 2.0 when possible (automatic token refresh)

### Performance
- Use **Load Testing** to identify performance bottlenecks
- Monitor p95 and p99 latencies for real-world scenarios
- Test with realistic RPM values
- Export results for historical tracking

### Development Workflow
- Use **Mock Server** to develop frontend before backend is ready
- Use **History** to replay previous requests
- Use **Notepad** for quick API response analysis or documentation
- Use **AI Assistant** for debugging and understanding responses

## Contributing

API Courier follows **enterprise-grade development practices**:

### Code Quality Standards
- **TypeScript**: Strict mode, no `any` except at boundaries
- **ESLint + Prettier**: Enforced code style and linting
- **Modular Design**: Files ≤300 lines (main), ≤150-300 lines (renderer)
- **Type Safety**: Shared types in `src/shared/types.ts`
- **Testing**: Vitest for unit tests on pure logic

### Security Requirements
- **Never** disable security features (context isolation, sandbox)
- **Never** use Node/Electron APIs directly in renderer
- **Always** use whitelisted IPC channels
- **Always** redact secrets in logs
- **Never** store sensitive data in localStorage

### Development Guidelines
1. Read [CLAUDE.md](./CLAUDE.md) for repo instructions
2. Follow the IPC sequence: types → IPC constants → handler → preload → renderer
3. Keep modules small and focused
4. Write tests for complex logic
5. Run `npm run lint` and `npm run format` before commits
6. Ensure `npm run build` passes

### Pull Request Process
1. Fork and create a feature branch
2. Make your changes following code standards
3. Add tests if applicable
4. Update documentation if needed
5. Run `npm run build` to ensure no errors
6. Submit PR with clear description

## Roadmap

### Planned Features
- [ ] GraphQL support
- [ ] WebSocket testing
- [ ] gRPC support
- [ ] API documentation generation
- [ ] Team collaboration features
- [ ] Cloud sync (optional)
- [ ] Performance profiling
- [ ] Request chaining/workflows
- [ ] Custom plugins/extensions
- [ ] Multi-language code generation

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Support

- **Issues**: Report bugs or request features on GitHub Issues
- **Discussions**: Ask questions or share ideas on GitHub Discussions
- **Documentation**: Full docs available in the repo

---

**Built with ❤️ for developers who demand security, performance, and features.**
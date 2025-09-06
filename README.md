# API Courier

A professional API testing tool built with Electron and TypeScript. Compete with Insomnia/Postman in quality and features.

![API Courier Screenshot](screenshot.png)

## Features

### Current Features (v1.0)
- **Professional Dark Theme UI** - Sleek, modern interface with light/dark theme toggle
- **API Testing** - Full HTTP request testing with all methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- **Collections Management** - Organize requests in folders and sub-collections
- **Request Builder** - Complete request configuration with params, headers, body, and auth
- **Response Viewer** - Pretty JSON formatting, raw view, and headers inspection
- **Environment Variables** - Manage different environments and variables
- **Request History** - Keep track of recent requests
- **Import Collections** - Import from Postman/Insomnia JSON files

### Planned Features (Coming Soon)
- **JSON Viewer** - Standalone JSON formatting and viewing tool
- **JSON Compare** - Compare two JSON objects with diff highlighting
- **Load Testing** - Performance testing with multiple concurrent requests  
- **Ask AI** - AI-powered API documentation and testing assistance

## Architecture

The application follows a modular architecture with clear separation between processes:

### Main Process (`src/main/`)
- **`index.ts`** - Application entry point and initialization
- **`windows/window-manager.ts`** - Window creation and management
- **`persistence/persistence-manager.ts`** - Data storage using LowDB
- **`networking/network-manager.ts`** - HTTP request execution
- **`ipc/ipc-manager.ts`** - Inter-process communication handlers

### Preload Script (`src/preload/`)
- **`preload.ts`** - Secure API bridge between main and renderer processes

### Renderer Process (`src/renderer/`)
- **`index.html`** - Main application HTML structure
- **`js/main.ts`** - Frontend application logic and UI management
- **`styles/main.css`** - Professional styling with CSS variables for theming

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/shivam96anand/api-courier2.0.git
cd api-courier2.0
```

2. Install dependencies:
```bash
npm install
```

3. Build the application:
```bash
npm run build
```

4. Run the application:
```bash
npm start
```

### Development

For development with hot reload:

```bash
# Start TypeScript watchers
npm run watch

# In another terminal, run the app in dev mode
npm run dev
```

## Project Structure

```
api-courier2.0/
├── src/
│   ├── main/                 # Main process (Electron backend)
│   │   ├── index.ts         # Application entry point
│   │   ├── windows/         # Window management
│   │   ├── persistence/     # Data storage
│   │   ├── networking/      # HTTP requests
│   │   └── ipc/            # Inter-process communication
│   ├── preload/            # Preload script (secure bridge)
│   │   └── preload.ts      # API exposure to renderer
│   └── renderer/           # Renderer process (frontend)
│       ├── index.html      # Main HTML
│       ├── js/            # TypeScript frontend code
│       └── styles/        # CSS styling
├── dist/                   # Compiled output
├── package.json           # Dependencies and scripts
└── tsconfig.*.json       # TypeScript configurations
```

## Usage

### Making HTTP Requests

1. **Select Method**: Choose HTTP method from the dropdown (GET, POST, PUT, etc.)
2. **Enter URL**: Type the request URL in the input field
3. **Add Parameters**: Switch to the "Params" tab to add query parameters
4. **Set Headers**: Use the "Headers" tab to add custom headers
5. **Configure Body**: For POST/PUT requests, use the "Body" tab to set request body
6. **Set Authentication**: Configure auth in the "Auth" tab (Basic, Bearer, API Key, OAuth2)
7. **Send Request**: Click the "Send" button to execute the request

### Managing Collections

- Use the Collections panel on the left to organize your requests
- Create folders to group related requests
- Import existing collections from Postman or Insomnia JSON files
- Click on any collection item to load it into the request panel

### Response Inspection

The response panel provides three views:
- **Pretty**: Formatted JSON with syntax highlighting and collapsible trees
- **Raw**: Raw response text
- **Headers**: Response headers in key-value format

### Environment Variables

- Manage multiple environments (Development, Staging, Production)
- Set variables that can be used across requests
- Switch between environments easily

## Security

API Courier follows Electron security best practices:
- Context isolation enabled
- Node.js integration disabled in renderer
- Sandbox mode enabled
- Content Security Policy implemented
- Secure IPC communication patterns

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- TypeScript for type safety
- LowDB for local data persistence
- Modern CSS with CSS Variables for theming
- Inspired by Postman and Insomnia

# Response Viewer Module

A high-performance JSON viewer with perfect line number alignment, virtualization, and advanced features for API Courier.

## Features

### ✅ Perfect Line Numbers
- **CodeMirror 6** based Raw editor with bulletproof line number alignment
- No drift under any circumstances: wrapping, long lines, zooming, resizing
- Consistent behavior across all browsers and scaling levels

### ⚡ High Performance
- **Virtualized rendering** for JSON trees with 10,000+ nodes
- **Web Worker** based parsing for files up to 20MB
- **Incremental rendering** to prevent UI blocking
- **Debounced state saves** for smooth interaction

### 🎯 Developer-Friendly
- **TypeScript** everywhere with complete type safety
- **Unit tested** utilities and state management
- **Clean architecture** with 150-300 line files
- **Zero external dependencies** beyond CodeMirror

### 🔍 Advanced Search
- **Full-text search** across JSON keys and values
- **JSONPath evaluation** with worker-based execution
- **Next/prev navigation** with visual highlighting
- **Keyboard shortcuts**: Ctrl+F, F3, Shift+F3

### 💾 Smart State Management
- **Request-scoped persistence** to localStorage
- **Automatic state restoration** when switching requests
- **Expansion state** preserved across sessions
- **Global settings** shared between viewers

### 🎨 Rich UI Features
- **Three view modes**: Pretty tree, Raw editor, Headers table
- **Type badges** and action menus on nodes
- **Font size controls** and text wrapping toggle
- **Fullscreen modal** with 85% width and backdrop blur
- **Dark/light theme** support

## Usage

### Basic Usage

```typescript
import { JsonViewer } from './response-viewer';

// Create viewer instance
const viewer = new JsonViewer('container-id', {
  requestId: 'unique-request-id',
  theme: 'light',
  fontSize: 13
});

// Set JSON content
viewer.setContent('{"name": "John", "age": 30}');

// Or set parsed data
viewer.setData({ name: 'John', age: 30 });
```

### Advanced Usage

```typescript
import { JsonViewer, JsonUtils, ViewerStateManager } from './response-viewer';

// Custom state management
const stateManager = new ViewerStateManager('my-request');
stateManager.setFontSize(16);
stateManager.toggleTextWrap();

// Format JSON with worker
const result = await JsonUtils.formatJson(data, 2);
if (result.success) {
  viewer.setContent(result.formatted);
}

// Handle large files
const parseResult = await JsonUtils.parseJson(largeJsonString);
if (parseResult.isLargeFile) {
  console.warn('Large file detected');
}
```

### Public API

```typescript
interface JsonViewerHandle {
  setContent: (text: string) => void;
  getContent: () => string;
  format: () => Promise<void>;
  goToLine: (line: number) => void;
  find: (query: string, direction?: 1 | -1) => void;
  toggleWrap: () => void;
  openFullscreen: (tab?: 'raw' | 'pretty') => void;
  expandAll: () => void;
  collapseAll: () => void;
  exportData: () => void;
}
```

### Keyboard Shortcuts

- `Ctrl/Cmd + F` - Search
- `F3` - Next match
- `Shift + F3` - Previous match
- `Ctrl/Cmd + B` - Format JSON
- `Ctrl/Cmd + M` - Minify JSON
- `Ctrl/Cmd + W` - Toggle word wrap
- `Ctrl/Cmd + E` - Expand all
- `Ctrl/Cmd + Shift + E` - Collapse all
- `Ctrl/Cmd + =` - Increase font size
- `Ctrl/Cmd + -` - Decrease font size
- `F11` - Fullscreen
- `Escape` - Close search/fullscreen

## Architecture

### Component Structure

```
JsonViewer (main)
├── Toolbar (controls)
├── RawEditor (CodeMirror 6)
├── JsonTree (virtualized)
│   └── JsonNode (renderer)
├── SearchBar (with JSONPath)
└── FullscreenViewer (modal)
```

### State Management

- **ViewerStateManager**: Per-request state with localStorage persistence
- **Global settings**: Font size, theme, wrap, type badges
- **Request-specific**: Tab, scroll, expansion, search state

### Performance Optimizations

- **Virtualization threshold**: 1,000 visible nodes
- **Max file size**: 50MB with warnings at 10MB
- **Worker timeout**: 10 seconds with main thread fallback
- **Debounce delays**: 300ms saves, 150ms search

## Testing

```bash
# Run tests
npm test

# Test coverage
npm run test:coverage
```

### Test Files

- `__tests__/json.test.ts` - JSON utilities
- `__tests__/viewerState.test.ts` - State management
- More tests can be added for individual components

## Performance Guidelines

### Large Files (>10MB)
- Parsing moves to Web Worker automatically
- Virtualization enables smooth scrolling
- Expansion warnings prevent UI lock-up

### Memory Management
- State cleanup on component destroy
- Worker termination on unmount
- localStorage cleanup of old states

### Browser Support
- Modern browsers with ES2020+ support
- Web Workers and localStorage required
- ResizeObserver with polyfill fallback

## Migration from Legacy JsonViewer

The new implementation provides backward compatibility:

```typescript
// Old API still works
viewer.setData(jsonData);
viewer.performSearch('query');
viewer.expandAll();
viewer.clear();

// New API provides more features
viewer.openFullscreen('pretty');
viewer.format();
viewer.exportData();
```

## Future Enhancements

- **Diff mode** for comparing responses
- **Inline editing** with validation
- **Performance telemetry** dashboard
- **JSONPath builder** UI
- **Custom formatters** for special data types

---

Built for **API Courier** with ❤️ by the development team.
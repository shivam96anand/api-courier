/**
 * Response Viewer Module - Main exports
 *
 * This module provides a complete JSON viewer implementation with:
 * - Perfect line number alignment in Raw view (CodeMirror 6)
 * - Virtualized Pretty view for large datasets
 * - Request-scoped state management with persistence
 * - Full-text search with JSONPath support
 * - Fullscreen modal with backdrop blur
 * - Keyboard shortcuts and accessibility
 */

// Main components
export { JsonViewer } from './JsonViewer';
export { RawEditor } from './RawEditor';
export { JsonTree } from './JsonTree';
export { JsonNodeRenderer } from './JsonNode';
export { Toolbar } from './Toolbar';
export { SearchBar } from './SearchBar';
export { FullscreenViewer } from './FullscreenViewer';

// State management
export { ViewerStateManager } from './viewerState';

// Utilities
export { JsonUtils } from './utils/json';

// Types
export * from './types';

// Default export for backward compatibility
export { JsonViewer as default } from './JsonViewer';
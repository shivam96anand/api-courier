/**
 * Core types for the response viewer module
 */

export type ViewerTab = 'pretty' | 'raw' | 'headers';

export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonNode {
  id: string;                    // Stable identifier for the node (path-based)
  key: string;                   // The property key (empty for root)
  value: any;                    // The actual value
  type: JsonValueType;           // Type of the value
  level: number;                 // Nesting depth
  path: string[];                // Full path to this node
  isExpanded: boolean;           // Expansion state
  parent?: JsonNode;             // Reference to parent node
  children?: JsonNode[];         // Child nodes (for objects/arrays)
  hasChildren: boolean;          // Whether this node can have children
  childCount: number;            // Number of children
}

export interface ViewerState {
  requestId: string;
  activeTab: ViewerTab;
  rawEditor: {
    wrapText: boolean;
    fontSize: number;
    theme: 'light' | 'dark';
    scrollPosition: number;
    cursorPosition: number;
    selection?: { from: number; to: number };
  };
  prettyView: {
    expandedNodes: Set<string>;    // Set of expanded node IDs
    fontSize: number;
    showTypes: boolean;
    scrollPosition: number;
    selectedNode?: string;
  };
  search: {
    query: string;
    isVisible: boolean;
    currentIndex: number;
    totalMatches: number;
    jsonPath?: string;
  };
}

export interface SearchMatch {
  nodeId: string;
  path: string[];
  key?: string;
  value?: string;
  startIndex: number;
  endIndex: number;
  isKey: boolean;
  jsonPath: string;
}

export interface JsonViewerHandle {
  setContent: (text: string) => void;
  getContent: () => string;
  format: () => Promise<void>;
  goToLine: (line: number) => void;
  find: (query: string, direction?: 1 | -1) => void;
  toggleWrap: () => void;
  openFullscreen: (tab?: ViewerTab) => void;
  expandAll: () => void;
  collapseAll: () => void;
  exportData: () => void;
}

export interface JsonViewerOptions {
  requestId: string;
  initialContent?: string;
  initialTab?: ViewerTab;
  theme?: 'light' | 'dark';
  fontSize?: number;
  showLineNumbers?: boolean;
  enableVirtualization?: boolean;
  maxFileSize?: number; // in bytes
}

export interface WorkerMessage {
  id: string;
  type: string;
  payload: any;
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface JsonParseResult {
  success: boolean;
  data?: any;
  error?: string;
  isLargeFile?: boolean;
  nodeCount?: number;
}

export interface FormatResult {
  success: boolean;
  formatted?: string;
  error?: string;
}

export interface JsonPathResult {
  success: boolean;
  matches?: Array<{
    path: string;
    value: any;
    jsonPath: string;
  }>;
  error?: string;
}

// Event types for communication between components
export interface ViewerEvents {
  'content-changed': { content: string };
  'tab-changed': { tab: ViewerTab };
  'search-changed': { query: string; matches: SearchMatch[] };
  'node-expanded': { nodeId: string; expanded: boolean };
  'fullscreen-requested': { tab: ViewerTab };
  'format-requested': void;
  'export-requested': void;
}

// Configuration constants
export const VIEWER_CONSTANTS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024, // 10MB
  VIRTUALIZATION_THRESHOLD: 1000, // nodes
  DEBOUNCE_DELAY: 300, // ms
  SEARCH_DEBOUNCE: 150, // ms
  MAX_EXPAND_WARNING: 5000, // nodes
  LINE_HEIGHT: 20, // px
  MIN_FONT_SIZE: 10,
  MAX_FONT_SIZE: 24,
  DEFAULT_FONT_SIZE: 13,
} as const;

// CSS classes for styling
export const VIEWER_CLASSES = {
  container: 'json-viewer-container',
  toolbar: 'json-viewer-toolbar',
  content: 'json-viewer-content',
  rawEditor: 'json-viewer-raw',
  prettyTree: 'json-viewer-pretty',
  searchBar: 'json-viewer-search',
  fullscreen: 'json-viewer-fullscreen',
  node: 'json-node',
  nodeExpanded: 'json-node--expanded',
  nodeCollapsed: 'json-node--collapsed',
  nodeKey: 'json-node__key',
  nodeValue: 'json-node__value',
  nodeType: 'json-node__type',
  searchHighlight: 'search-highlight',
  searchActive: 'search-highlight--active',
} as const;
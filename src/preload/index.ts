import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channels to avoid module resolution issues in sandbox
const IPC_CHANNELS = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  REQUEST_SEND: 'request:send',
  REQUEST_CANCEL: 'request:cancel',
  COLLECTION_CREATE: 'collection:create',
  COLLECTION_UPDATE: 'collection:update',
  COLLECTION_DELETE: 'collection:delete',

  // Load Testing channels
  LOADTEST_START: 'loadtest:start',
  LOADTEST_PROGRESS: 'loadtest:progress',
  LOADTEST_SUMMARY: 'loadtest:summary',
  LOADTEST_CANCEL: 'loadtest:cancel',
  LOADTEST_EXPORT_CSV: 'loadtest:export-csv',
  LOADTEST_EXPORT_PDF: 'loadtest:export-pdf',

  // OAuth channels
  OAUTH_START_FLOW: 'oauth:start-flow',
  OAUTH_REFRESH_TOKEN: 'oauth:refresh-token',
  OAUTH_GET_TOKEN_INFO: 'oauth:get-token-info',

  // File operations channels
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_READ_CONTENT: 'file:read-content',
  FILE_READ_BINARY: 'file:read-binary',

  // Import channels
  IMPORT_PARSE_PREVIEW: 'import:parse-preview',
  IMPORT_COMMIT: 'import:commit',

  // Collections UI state channels
  COLLECTIONS_STATE_GET: 'collections-state:get',
  COLLECTIONS_STATE_SET: 'collections-state:set',

  // JSON Viewer UI state channels
  JSONVIEWER_STATE_GET: 'jsonviewer-state:get',
  JSONVIEWER_STATE_SET: 'jsonviewer-state:set',

  // Backup channels
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',

  // System helpers
  OPEN_EXTERNAL: 'system:open-external',

  // AI Chat channels
  AI_GET_SESSIONS: 'ai:get-sessions',
  AI_CREATE_SESSION: 'ai:create-session',
  AI_DELETE_SESSION: 'ai:delete-session',
  AI_SEND_MESSAGE: 'ai:send-message',
  AI_MESSAGE_STREAM: 'ai:message-stream',
  AI_CHECK_ENGINE: 'ai:check-engine',
  AI_UPDATE_SESSION: 'ai:update-session',

  // Notepad channels
  NOTEPAD_SAVE_FILE: 'notepad:save-file',
  NOTEPAD_OPEN_FILE: 'notepad:open-file',
  NOTEPAD_READ_FILE: 'notepad:read-file',
  NOTEPAD_REVEAL: 'notepad:reveal',

  // Mock Server channels
  MOCKSERVER_LIST: 'mockserver:list',
  MOCKSERVER_CREATE_SERVER: 'mockserver:create-server',
  MOCKSERVER_UPDATE_SERVER: 'mockserver:update-server',
  MOCKSERVER_DELETE_SERVER: 'mockserver:delete-server',
  MOCKSERVER_START_SERVER: 'mockserver:start-server',
  MOCKSERVER_STOP_SERVER: 'mockserver:stop-server',
  MOCKSERVER_ADD_ROUTE: 'mockserver:add-route',
  MOCKSERVER_UPDATE_ROUTE: 'mockserver:update-route',
  MOCKSERVER_DELETE_ROUTE: 'mockserver:delete-route',
  MOCKSERVER_TOGGLE_ROUTE: 'mockserver:toggle-route',
  MOCKSERVER_PICK_FILE: 'mockserver:pick-file',
  MOCKSERVER_STATUS_CHANGED: 'mockserver:status-changed',

  // cURL channels
  CURL_EXECUTE: 'curl:execute',
  CURL_CANCEL: 'curl:cancel',

  // Auto-updater channels
  UPDATE_INSTALL: 'update:install',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_DOWNLOAD_PROGRESS: 'update:download-progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error',
} as const;

// Define types inline to avoid import issues
interface ApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: Record<string, string>;
  body?: {
    type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
    content: string;
  };
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    config: Record<string, string>;
  };
}

interface Collection {
  id: string;
  name: string;
  type: 'folder' | 'request';
  parentId?: string;
  children?: Collection[];
  request?: ApiRequest;
  createdAt: Date;
  updatedAt: Date;
}

interface AppTheme {
  name: string;
  primaryColor: string;
  accentColor: string;
}

interface NotepadTab {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
}

interface NotepadState {
  tabs: NotepadTab[];
  activeTabId?: string;
  untitledCounter: number;
}

interface AppState {
  collections: Collection[];
  openTabs: any[];
  activeTabId?: string;
  selectedCollectionId?: string;
  theme: AppTheme;
  navOrder: string[];
  notepad?: NotepadState;
  hasCompletedThemeOnboarding?: boolean;
}

interface BackupInfo {
  id: string;
  filename: string;
  createdAt: number;
}

// Load Testing Types
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

interface RequestBody {
  type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
  content: string;
}

interface LoadTestTargetFromCollection {
  kind: 'collection';
  requestId: string;
}

interface LoadTestTargetAdHoc {
  kind: 'adhoc';
  method: HttpMethod;
  url: string;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  auth?: { type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2'; data?: unknown };
  body?: RequestBody;
  collectionId?: string;
}

type LoadTestTarget = LoadTestTargetFromCollection | LoadTestTargetAdHoc;

interface LoadTestConfig {
  rpm: number;
  durationSec: number;
  target: LoadTestTarget;
  followRedirects?: boolean;
  insecureTLS?: boolean;
  requestTimeoutMs?: number;
}

interface LoadTestProgressTick {
  runId: string;
  scheduled: number;
  sent: number;
  completed: number;
  inFlight: number;
  elapsedSec: number;
}

interface LoadTestSummary {
  runId: string;
  totalPlanned: number;
  sent: number;
  completed: number;
  success: number;
  error: number;
  codeCounts: Record<string, number>;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  throughputRps: number;
  wallTimeMs: number;
  startedAt: number;
  finishedAt: number;
}

// OAuth 2.0 Types
interface OAuthConfig {
  grantType: 'authorization_code' | 'client_credentials' | 'device_code';
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  scope?: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

interface OAuthResult {
  success: boolean;
  data?: OAuthTokenResponse;
  error?: string;
}

interface CollectionsUIState {
  expandedFolderIds: string[];
}

interface JsonViewerUIState {
  expandedNodesByRequest: Record<string, string[]>;
  requestAccessOrder: string[];
}

// AI Chat Types
interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface AiContext {
  request?: ApiRequest;
  response?: ApiResponse;
  fileContent?: string;
  fileName?: string;
}

interface AiSession {
  id: string;
  title: string;
  messages: AiMessage[];
  context?: AiContext;
  createdAt: number;
  updatedAt: number;
}

interface AiSessionsState {
  sessions: AiSession[];
  activeSessionId?: string;
}

interface AiSendMessageParams {
  sessionId: string;
  message: string;
  context?: AiContext;
}

interface AiSendMessageResult {
  success: boolean;
  message?: AiMessage;
  error?: string;
  tokenLimitExceeded?: boolean;
}

interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  timestamp: number;
}

// Mock Server Types
type MockResponseType = 'json' | 'text' | 'binary' | 'file';
type MockHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type MockPathMatchType = 'exact' | 'prefix' | 'wildcard' | 'regex';

interface MockRouteHeader {
  key: string;
  value: string;
  enabled: boolean;
}

interface MockRoute {
  id: string;
  enabled: boolean;
  method: MockHttpMethod;
  path: string;
  pathMatchType?: MockPathMatchType;
  statusCode: number;
  headers: MockRouteHeader[];
  delayMs?: number;
  responseType: MockResponseType;
  body: string;
  contentType?: string;
}

interface MockServerDefinition {
  id: string;
  name: string;
  host: string;
  port: number | null;
  routes: MockRoute[];
  createdAt: number;
  updatedAt: number;
}

interface MockServerRuntimeStatus {
  serverId: string;
  isRunning: boolean;
  error?: string;
}

interface MockServerIpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

interface MockServerListResponse {
  servers: MockServerDefinition[];
  runtimeStatus: MockServerRuntimeStatus[];
}

interface MockServerCreateParams {
  name: string;
  host?: string;
  port?: number | null;
}

interface MockServerUpdateParams {
  serverId: string;
  name?: string;
  host?: string;
  port?: number | null;
}

interface MockRouteCreateParams {
  serverId: string;
  route: Omit<MockRoute, 'id'>;
}

interface MockRouteUpdateParams {
  serverId: string;
  routeId: string;
  updates: Partial<Omit<MockRoute, 'id'>>;
}

interface MockRouteDeleteParams {
  serverId: string;
  routeId: string;
}

interface MockRouteToggleParams {
  serverId: string;
  routeId: string;
  enabled: boolean;
}

interface MockServerStatusChangedEvent {
  serverId: string;
  isRunning: boolean;
  error?: string;
}

const apiCourierAPI = {
  store: {
    get: (): Promise<AppState> => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET),
    set: (updates: Partial<AppState>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, updates),
  },

  request: {
    send: (request: ApiRequest) => ipcRenderer.invoke(IPC_CHANNELS.REQUEST_SEND, request),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC_CHANNELS.REQUEST_CANCEL, requestId),
  },

  collection: {
    create: (collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> =>
      ipcRenderer.invoke(IPC_CHANNELS.COLLECTION_CREATE, collection),
    update: (id: string, updates: Partial<Collection>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.COLLECTION_UPDATE, id, updates),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.COLLECTION_DELETE, id),
  },

  loadtest: {
    start: (config: LoadTestConfig): Promise<{ runId: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOADTEST_START, config),
    cancel: (runId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOADTEST_CANCEL, { runId }),
    exportCsv: (runId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOADTEST_EXPORT_CSV, { runId }),
    exportPdf: (runId: string, summary: LoadTestSummary): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOADTEST_EXPORT_PDF, { runId, summary }),
    onProgress: (callback: (progress: LoadTestProgressTick) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.LOADTEST_PROGRESS, (_, progress) => callback(progress));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.LOADTEST_PROGRESS);
    },
    onSummary: (callback: (summary: LoadTestSummary) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.LOADTEST_SUMMARY, (_, summary) => callback(summary));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.LOADTEST_SUMMARY);
    },
  },

  oauth: {
    startFlow: (config: OAuthConfig): Promise<OAuthResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.OAUTH_START_FLOW, config),
    refreshToken: (config: OAuthConfig): Promise<OAuthResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.OAUTH_REFRESH_TOKEN, config),
    getTokenInfo: (config: OAuthConfig): Promise<{ isValid: boolean; expiresIn?: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OAUTH_GET_TOKEN_INFO, config),
  },

  files: {
    openDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG),
    readContent: (filePath: string): Promise<{ success: boolean; content: string; filePath: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_CONTENT, filePath),
    readBinary: (filePath: string): Promise<{ success: boolean; content: string; filePath: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_BINARY, filePath),
  },

  import: {
    parsePreview: (fileContent: string): Promise<{ success: boolean; preview?: any; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PARSE_PREVIEW, fileContent),
    commit: (preview: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.IMPORT_COMMIT, preview),
  },

  collectionsState: {
    get: (): Promise<CollectionsUIState> =>
      ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_STATE_GET),
    set: (uiState: CollectionsUIState): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_STATE_SET, uiState),
  },

  jsonViewerState: {
    get: (): Promise<JsonViewerUIState> =>
      ipcRenderer.invoke(IPC_CHANNELS.JSONVIEWER_STATE_GET),
    set: (uiState: JsonViewerUIState): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.JSONVIEWER_STATE_SET, uiState),
  },

  backups: {
    list: (): Promise<BackupInfo[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST),
    restore: (backupId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, backupId),
  },

  system: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  },

  notepad: {
    saveFile: (args: { filePath?: string; content: string; defaultName?: string }): Promise<{ filePath?: string; canceled?: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEPAD_SAVE_FILE, args),
    openFile: (): Promise<{ filePath?: string; content?: string; canceled?: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEPAD_OPEN_FILE),
    readFile: (filePath: string): Promise<{ content?: string; canceled?: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEPAD_READ_FILE, filePath),
    revealInFolder: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEPAD_REVEAL, filePath),
  },

  ai: {
    getSessions: (): Promise<AiSessionsState> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_SESSIONS),
    createSession: (context?: AiContext): Promise<AiSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CREATE_SESSION, context),
    deleteSession: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_SESSION, sessionId),
    updateSession: (sessionId: string, updates: { title?: string; context?: AiContext }): Promise<AiSession | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_UPDATE_SESSION, sessionId, updates),
    sendMessage: (params: AiSendMessageParams): Promise<AiSendMessageResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SEND_MESSAGE, params),
    onMessageStream: (callback: (data: { requestId: string; chunk: string }) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.AI_MESSAGE_STREAM, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_MESSAGE_STREAM);
    },
    checkEngine: (): Promise<{ available: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CHECK_ENGINE),
  },

  mockServer: {
    list: (): Promise<MockServerIpcResponse<MockServerListResponse>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_LIST),
    createServer: (params: MockServerCreateParams): Promise<MockServerIpcResponse<MockServerDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_CREATE_SERVER, params),
    updateServer: (params: MockServerUpdateParams): Promise<MockServerIpcResponse<MockServerDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_UPDATE_SERVER, params),
    deleteServer: (serverId: string): Promise<MockServerIpcResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_DELETE_SERVER, serverId),
    startServer: (serverId: string): Promise<MockServerIpcResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_START_SERVER, serverId),
    stopServer: (serverId: string): Promise<MockServerIpcResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_STOP_SERVER, serverId),
    addRoute: (params: MockRouteCreateParams): Promise<MockServerIpcResponse<MockRoute>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_ADD_ROUTE, params),
    updateRoute: (params: MockRouteUpdateParams): Promise<MockServerIpcResponse<MockRoute>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_UPDATE_ROUTE, params),
    deleteRoute: (params: MockRouteDeleteParams): Promise<MockServerIpcResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_DELETE_ROUTE, params),
    toggleRoute: (params: MockRouteToggleParams): Promise<MockServerIpcResponse<MockRoute>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_TOGGLE_ROUTE, params),
    pickFile: (): Promise<MockServerIpcResponse<{ canceled: boolean; filePath: string | null }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MOCKSERVER_PICK_FILE),
    onStatusChanged: (callback: (event: MockServerStatusChangedEvent) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.MOCKSERVER_STATUS_CHANGED, (_, event) => callback(event));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.MOCKSERVER_STATUS_CHANGED);
    },
  },

  curl: {
    execute: (request: { id: string; rawCommand: string }): Promise<any> =>
      ipcRenderer.invoke(IPC_CHANNELS.CURL_EXECUTE, request),
    cancel: (requestId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CURL_CANCEL, requestId),
  },

  update: {
    install: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    onAvailable: (callback: (data: { version: string }) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_AVAILABLE);
    },
    onDownloadProgress: (callback: (data: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS);
    },
    onDownloaded: (callback: (data: { version: string }) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOADED, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOADED);
    },
    onError: (callback: (data: { message: string }) => void): (() => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_ERROR, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_ERROR);
    },
  },
};

contextBridge.exposeInMainWorld('apiCourier', apiCourierAPI);
contextBridge.exposeInMainWorld('electronAPI', apiCourierAPI);

export type ApiCourierAPI = typeof apiCourierAPI;

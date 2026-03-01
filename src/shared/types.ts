export interface Collection {
  id: string;
  name: string;
  type: 'folder' | 'request';
  parentId?: string;
  order?: number; // Order within parent level (0-based)
  children?: Collection[];
  request?: ApiRequest;
  variables?: Record<string, string>; // folder-scoped variables (for folders only)
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  params?: KeyValuePair[] | Record<string, string>; // Support both formats for backward compatibility
  headers: KeyValuePair[] | Record<string, string>; // Support both formats for backward compatibility
  body?: {
    type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
    content: string;
    format?: 'json' | 'xml' | 'yaml' | 'text' | 'form-urlencoded';
    contentType?: string;
  };
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    config: Record<string, string>;
  };
  variables?: Record<string, string>; // request-local variables
  collectionId?: string; // track which collection/folder this request belongs to
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  timestamp: number; // Unix timestamp in milliseconds when response was received
}

export interface RequestTab {
  id: string;
  name: string;
  request: ApiRequest;
  response?: ApiResponse;
  isModified: boolean;
  collectionId?: string; // Track which collection this tab belongs to
  activeDetailsTab?: string; // Track active tab (params/body/auth/headers/curl) for this request tab
}

export interface HistoryItem {
  id: string;
  request: ApiRequest;
  response: ApiResponse;
  timestamp: Date;
}

export interface AppTheme {
  name: string;
  primaryColor: string;
  accentColor: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  variableDescriptions?: Record<string, string>;
}

export interface Globals {
  variables: Record<string, string>;
  variableDescriptions?: Record<string, string>;
}

export interface CollectionsUIState {
  expandedFolderIds: string[];
}

/**
 * UI state for JSON response viewer
 * Stores expanded node paths per request ID with LRU eviction
 */
export interface JsonViewerUIState {
  expandedNodesByRequest: Record<string, string[]>;
  requestAccessOrder: string[]; // LRU: most recent access at the end
}

export interface NotepadTab {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NotepadState {
  tabs: NotepadTab[];
  activeTabId?: string;
  untitledCounter: number;
}

export interface AppState {
  collections: Collection[];
  openTabs: RequestTab[];
  history: HistoryItem[];
  activeTabId?: string;
  selectedCollectionId?: string;
  theme: AppTheme;
  navOrder: string[];
  environments: Environment[];
  activeEnvironmentId?: string;
  globals: Globals;
  collectionsUIState?: CollectionsUIState;
  jsonViewerUIState?: JsonViewerUIState;
  notepad?: NotepadState;
  mockServers?: MockServersState;
  hasCompletedThemeOnboarding?: boolean;
}

// Load Testing Types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestBody {
  type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
  content: string;
  format?: 'json' | 'xml' | 'yaml' | 'text' | 'form-urlencoded';
  contentType?: string;
}

export interface LoadTestTargetFromCollection {
  kind: 'collection';
  requestId: string; // reference to saved request
}

export interface LoadTestTargetAdHoc {
  kind: 'adhoc';
  method: HttpMethod;
  url: string;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  auth?: { type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2'; data?: unknown };
  body?: RequestBody;
  collectionId?: string;
}

export type LoadTestTarget = LoadTestTargetFromCollection | LoadTestTargetAdHoc;

export interface LoadTestConfig {
  rpm: number;         // requests per minute
  durationSec: number; // total duration in seconds
  target: LoadTestTarget;
  followRedirects?: boolean;
  insecureTLS?: boolean;
  requestTimeoutMs?: number; // default to same as app default
}

export interface LoadTestProgressTick {
  runId: string;
  scheduled: number;   // requests scheduled so far
  sent: number;        // requests actually dispatched
  completed: number;   // responses received (success + error)
  inFlight: number;
  elapsedSec: number;
}

export interface LoadSample {
  t0: number;           // ms epoch when request started
  durationMs: number;   // total time
  status?: number;      // undefined if network error
  bytes?: number;
  error?: string | null;
}

export interface LoadTestSummary {
  runId: string;
  totalPlanned: number; // rpm * duration
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
export interface OAuthConfig {
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

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

export interface OAuthResult {
  success: boolean;
  data?: OAuthTokenResponse;
  error?: string;
}

export interface IpcChannels {
  'store:get': () => AppState;
  'store:set': (state: Partial<AppState>) => void;
  'request:send': (request: ApiRequest) => ApiResponse;
  'request:cancel': (requestId: string) => boolean;
  'collection:create': (collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Collection;
  'collection:update': (id: string, updates: Partial<Collection>) => void;
  'collection:delete': (id: string) => void;
  'oauth:start-flow': (config: OAuthConfig) => OAuthResult;
  'oauth:refresh-token': (config: OAuthConfig) => OAuthResult;
  'oauth:get-token-info': (config: OAuthConfig) => { isValid: boolean; expiresIn?: number };
}

// AI Chat Types
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AiContext {
  request?: ApiRequest;
  response?: ApiResponse;
  fileContent?: string;
  fileName?: string;
}

export interface AiSession {
  id: string;
  title: string;
  messages: AiMessage[];
  context?: AiContext;
  createdAt: number;
  updatedAt: number;
}

export interface AiSendMessageParams {
  sessionId: string;
  message: string;
  context?: AiContext;
}

export interface AiSendMessageResult {
  success: boolean;
  message?: AiMessage;
  error?: string;
  tokenLimitExceeded?: boolean;
}

export interface AiSessionsState {
  sessions: AiSession[];
  activeSessionId?: string;
}

// Token limit for Qwen 7B model (conservative estimate: ~12K chars ≈ 4K tokens)
export const AI_MAX_CONTEXT_CHARS = 12000;

// =====================================
// Mock Server Types
// =====================================

export type MockResponseType = 'json' | 'text' | 'binary' | 'file';

export type MockHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Path matching strategies for mock routes:
 * - 'exact': Path must match exactly (default)
 * - 'prefix': Path must start with the specified prefix
 * - 'wildcard': Supports * for single segment and ** for multiple segments
 * - 'regex': Path is treated as a regular expression pattern
 */
export type MockPathMatchType = 'exact' | 'prefix' | 'wildcard' | 'regex';

export interface MockRouteHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface MockRoute {
  id: string;
  enabled: boolean;
  method: MockHttpMethod;
  path: string; // path pattern based on pathMatchType
  pathMatchType?: MockPathMatchType; // defaults to 'exact' if not specified
  statusCode: number;
  headers: MockRouteHeader[];
  delayMs?: number;
  responseType: MockResponseType;
  body: string; // JSON string, plain text, base64 for binary, or file path for file
  contentType?: string; // optional override for content-type header
}

export interface MockServerDefinition {
  id: string;
  name: string;
  host: string; // default "127.0.0.1"
  port: number | null; // null until user sets it
  routes: MockRoute[];
  createdAt: number;
  updatedAt: number;
}

// Runtime status (not persisted)
export interface MockServerRuntimeStatus {
  serverId: string;
  isRunning: boolean;
  error?: string;
}

// Store state for mock servers
export interface MockServersState {
  servers: MockServerDefinition[];
}

// IPC DTOs
export interface MockServerIpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface MockServerListResponse {
  servers: MockServerDefinition[];
  runtimeStatus: MockServerRuntimeStatus[];
}

export interface MockServerCreateParams {
  name: string;
  host?: string;
  port?: number | null;
}

export interface MockServerUpdateParams {
  serverId: string;
  name?: string;
  host?: string;
  port?: number | null;
}

export interface MockRouteCreateParams {
  serverId: string;
  route: Omit<MockRoute, 'id'>;
}

export interface MockRouteUpdateParams {
  serverId: string;
  routeId: string;
  updates: Partial<Omit<MockRoute, 'id'>>;
}

export interface MockRouteDeleteParams {
  serverId: string;
  routeId: string;
}

export interface MockRouteToggleParams {
  serverId: string;
  routeId: string;
  enabled: boolean;
}

export interface MockServerStatusChangedEvent {
  serverId: string;
  isRunning: boolean;
  error?: string;
}

export interface Collection {
  id: string;
  name: string;
  type: 'folder' | 'request';
  parentId?: string;
  children?: Collection[];
  request?: ApiRequest;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  params?: Record<string, string>;
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

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

export interface RequestTab {
  id: string;
  name: string;
  request: ApiRequest;
  response?: ApiResponse;
  isModified: boolean;
  collectionId?: string; // Track which collection this tab belongs to
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

export interface AppState {
  collections: Collection[];
  openTabs: RequestTab[];
  history: HistoryItem[];
  activeTabId?: string;
  selectedCollectionId?: string;
  theme: AppTheme;
}

// Load Testing Types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestBody {
  type: 'none' | 'json' | 'raw' | 'form-data' | 'form-urlencoded';
  content: string;
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
  'collection:create': (collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Collection;
  'collection:update': (id: string, updates: Partial<Collection>) => void;
  'collection:delete': (id: string) => void;
  'oauth:start-flow': (config: OAuthConfig) => OAuthResult;
  'oauth:refresh-token': (config: OAuthConfig) => OAuthResult;
  'oauth:get-token-info': (config: OAuthConfig) => { isValid: boolean; expiresIn?: number };
}
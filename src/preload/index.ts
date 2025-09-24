import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channels to avoid module resolution issues in sandbox
const IPC_CHANNELS = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  REQUEST_SEND: 'request:send',
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
    type: 'none' | 'basic' | 'bearer' | 'api-key';
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

interface AppState {
  collections: Collection[];
  openTabs: any[];
  activeTabId?: string;
  selectedCollectionId?: string;
  theme: AppTheme;
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

const apiCourierAPI = {
  store: {
    get: (): Promise<AppState> => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET),
    set: (updates: Partial<AppState>): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, updates),
  },

  request: {
    send: (request: ApiRequest) => ipcRenderer.invoke(IPC_CHANNELS.REQUEST_SEND, request),
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
};

contextBridge.exposeInMainWorld('apiCourier', apiCourierAPI);

export type ApiCourierAPI = typeof apiCourierAPI;
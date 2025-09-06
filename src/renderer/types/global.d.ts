/**
 * Global type declarations for the renderer process
 */

// API types
interface Collection {
  id: string;
  name: string;
  parentId?: string;
  type: 'folder' | 'request';
  requests?: APIRequest[];
}

interface APIRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: Record<string, string>;
  body?: {
    type: 'json' | 'raw' | 'form-urlencoded' | 'form-data' | 'binary';
    content: string;
  };
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    config: Record<string, unknown>;
  };
}

interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  finalUrl: string;
  redirectChain: string[];
}

interface RequestOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
}

// API Courier API
interface APICourierAPI {
  store: {
    getCollections(): Promise<Collection[]>;
    saveCollection(collection: Collection): Promise<{ success: boolean }>;
    deleteCollection(id: string): Promise<{ success: boolean }>;
    getEnvironments(): Promise<Environment[]>;
    getActiveEnvironment(): Promise<Environment | null>;
    setActiveEnvironment(id: string): Promise<{ success: boolean }>;
    saveEnvironment(environment: Environment): Promise<{ success: boolean }>;
    getSettings(): Promise<{ theme: 'dark' | 'light'; followRedirects: boolean; requestTimeout: number }>;
    updateSettings(settings: Record<string, unknown>): Promise<{ success: boolean }>;
    getHistory(): Promise<APIRequest[]>;
    addToHistory(request: APIRequest): Promise<{ success: boolean }>;
  };
  network: {
    executeRequest(requestId: string, options: RequestOptions): Promise<{ success: boolean; data?: HTTPResponse; error?: string }>;
    cancelRequest(requestId: string): Promise<{ success: boolean }>;
    getActiveRequests(): Promise<string[]>;
    buildRequestBody(type: string, content: string, headers: Record<string, string>): Promise<{ success: boolean; data: { body: string; headers: Record<string, string> } }>;
    validateUrl(url: string): Promise<{ valid: boolean; error?: string }>;
  };
}

// Global declarations
declare const apiCourier: APICourierAPI;

// Window and DOM declarations for renderer process
declare const window: Window & typeof globalThis & {
  apiCourier: APICourierAPI;
  JSONTreeViewer: any;
  jsonTreeViewerInstance: any;
  jsonTreeExpand: () => void;
  jsonTreeCollapse: () => void;
  jsonTreeCopy: () => void;
};

declare const alert: (message: string) => void;
declare const prompt: (message?: string, defaultText?: string) => string | null;

import { contextBridge, ipcRenderer } from 'electron';
import { 
  Collection, 
  APIRequest, 
  Environment, 
  NetworkResponse,
  OAuth2Config,
  OAuth2TokenInfo,
  OIDCDiscoveryResponse,
  TokenIntrospectionResponse
} from '../shared/types';

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  finalUrl: string;
  redirectChain: string[];
}

/**
 * Store API - Persistence operations
 */
const storeAPI = {
  // Collections
  getCollections: (): Promise<Collection[]> => 
    ipcRenderer.invoke('store:getCollections'),
    
  saveCollection: (collection: Collection): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:saveCollection', collection),
    
  deleteCollection: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:deleteCollection', id),

  // Environments
  getEnvironments: (): Promise<Environment[]> =>
    ipcRenderer.invoke('store:getEnvironments'),
    
  getActiveEnvironment: (): Promise<Environment | null> =>
    ipcRenderer.invoke('store:getActiveEnvironment'),
    
  setActiveEnvironment: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:setActiveEnvironment', id),
    
  saveEnvironment: (environment: Environment): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:saveEnvironment', environment),

  // Settings
  getSettings: (): Promise<{ theme: 'dark' | 'light'; followRedirects: boolean; requestTimeout: number }> =>
    ipcRenderer.invoke('store:getSettings'),
    
  updateSettings: (settings: Record<string, unknown>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:updateSettings', settings),

  // History
  getHistory: (): Promise<APIRequest[]> =>
    ipcRenderer.invoke('store:getHistory'),
    
  addToHistory: (request: APIRequest): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:addToHistory', request),

  // Tab State
  saveTabState: (tabState: { tabs: any[]; activeTabId: string | null }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('store:saveTabState', tabState),
    
  getTabState: (): Promise<{ tabs: any[]; activeTabId: string | null } | null> =>
    ipcRenderer.invoke('store:getTabState'),
};

/**
 * Network API - HTTP request operations
 */
const networkAPI = {
  executeRequest: (requestId: string, options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    rejectUnauthorized?: boolean;
  }): Promise<{ success: boolean; data?: HTTPResponse; error?: string }> =>
    ipcRenderer.invoke('network:executeRequest', requestId, options),
    
  cancelRequest: (requestId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('network:cancelRequest', requestId),
    
  getActiveRequests: (): Promise<string[]> =>
    ipcRenderer.invoke('network:getActiveRequests'),
    
  validateUrl: (url: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('network:validateUrl', url),
};

/**
 * OAuth API - OAuth 2.0 / OIDC operations
 */
const oauthAPI = {
  discover: (issuer: string): Promise<{ success: boolean; data?: OIDCDiscoveryResponse; error?: string }> =>
    ipcRenderer.invoke('oauth:discover', issuer),
    
  getToken: (config: OAuth2Config): Promise<{ success: boolean; data?: OAuth2TokenInfo; error?: string }> =>
    ipcRenderer.invoke('oauth:getToken', config),
    
  refresh: (config: OAuth2Config, refreshToken: string): Promise<{ success: boolean; data?: OAuth2TokenInfo; error?: string }> =>
    ipcRenderer.invoke('oauth:refresh', config, refreshToken),
    
  introspect: (config: OAuth2Config, token: string): Promise<{ success: boolean; data?: TokenIntrospectionResponse; error?: string }> =>
    ipcRenderer.invoke('oauth:introspect', config, token),
};

/**
 * Files API - File dialog operations
 */
const filesAPI = {
  pick: (options?: { filters?: any[], properties?: string[] }): Promise<{ success: boolean; data?: string[]; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('files:pick', options || {}),
    
  save: (options: { 
    defaultPath?: string, 
    filters?: any[], 
    content: string | Buffer 
  }): Promise<{ success: boolean; data?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('files:save', options),
};

/**
 * Theme API - Theme management operations  
 */
const themeAPI = {
  getAvailable: (): Promise<{ success: boolean; data?: any[]; error?: string }> =>
    ipcRenderer.invoke('theme:getAvailable'),
    
  getCurrent: (): Promise<{ success: boolean; data?: any; error?: string }> =>
    ipcRenderer.invoke('theme:getCurrent'),
    
  setTheme: (themeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme:setTheme', themeId),
    
  generateCSS: (themeId: string): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('theme:generateCSS', themeId),
};

/**
 * Import API - Collection import operations
 */
const importAPI = {
  postman: (filePath: string): Promise<{ success: boolean; data?: any; error?: string }> =>
    ipcRenderer.invoke('import:postman', filePath),
    
  validate: (content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('import:validate', content),
};

/**
 * Exposed API object for the renderer process
 */
const apiCourierAPI = {
  store: storeAPI,
  network: networkAPI,
  oauth: oauthAPI,
  files: filesAPI,
  theme: themeAPI,
  import: importAPI,
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('apiCourier', apiCourierAPI);

// Type definitions for the renderer process
export type APICourierAPI = typeof apiCourierAPI;

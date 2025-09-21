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
    type: 'none' | 'basic' | 'bearer' | 'api-key';
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

export interface IpcChannels {
  'store:get': () => AppState;
  'store:set': (state: Partial<AppState>) => void;
  'request:send': (request: ApiRequest) => ApiResponse;
  'collection:create': (collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Collection;
  'collection:update': (id: string, updates: Partial<Collection>) => void;
  'collection:delete': (id: string) => void;
}
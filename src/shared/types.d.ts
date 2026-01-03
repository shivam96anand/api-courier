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
    timestamp: number;
}
export interface RequestTab {
    id: string;
    name: string;
    request: ApiRequest;
    response?: ApiResponse;
    isModified: boolean;
}
export interface AppTheme {
    name: string;
    primaryColor: string;
    accentColor: string;
}
export interface AppState {
    collections: Collection[];
    openTabs: RequestTab[];
    activeTabId?: string;
    selectedCollectionId?: string;
    theme: AppTheme;
    navOrder: string[];
    hasCompletedThemeOnboarding?: boolean;
}
export interface IpcChannels {
    'store:get': () => AppState;
    'store:set': (state: Partial<AppState>) => void;
    'request:send': (request: ApiRequest) => ApiResponse;
    'request:cancel': (requestId: string) => boolean;
    'collection:create': (collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Collection;
    'collection:update': (id: string, updates: Partial<Collection>) => void;
    'collection:delete': (id: string) => void;
}

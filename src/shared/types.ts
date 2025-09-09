export interface Collection {
  id: string;
  name: string;
  parentId?: string;
  children?: Collection[];
  requests?: Request[];
  type: 'collection' | 'folder';
}

export interface Request {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: RequestBody;
  auth?: AuthConfig;
  params?: Record<string, string>;
  collectionId?: string;
  parentId?: string;
}

export interface RequestBody {
  type: 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary';
  data: any;
}

export interface AuthConfig {
  type: AuthType;
  credentials: Record<string, any>;
}

export interface Response {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  size: number;
  time: number;
  url: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'basic' | 'bearer' | 'oauth1' | 'oauth2' | 'api-key';

export interface Theme {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    accent: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
}

export interface AppSettings {
  theme: string;
  fontSize: number;
  sidebarWidth: number;
  requestPanelWidth: number;
  expandedFolders: string[];
}

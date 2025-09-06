export interface OIDCDiscoveryResponse {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint?: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OAuth2Config {
  grantType: 'client_credentials' | 'authorization_code' | 'device_code' | 'refresh_token';
  clientId: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl: string;
  redirectUri?: string;
  scope?: string;
  useDiscovery?: boolean;
  discoveryUrl?: string;
  usePKCE?: boolean;
  useKeychain?: boolean;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface OAuth2TokenInfo {
  access_token: string;
  token_type: string;
  expires_at?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface TokenIntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string | string[];
  iss?: string;
}

export type BodyType = 'none' | 'json' | 'xml' | 'html' | 'text' | 'javascript' | 'urlencoded' | 'formdata' | 'binary';

export interface KeyValuePair {
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export interface FormDataEntry extends KeyValuePair {
  type: 'text' | 'file';
  filePath?: string;
  fileName?: string;
  contentType?: string;
}

export interface BinaryBody {
  filePath: string;
  fileName: string;
  contentType?: string;
  size: number;
}

export interface RequestBody {
  type: BodyType;
  raw?: string;
  urlencoded?: KeyValuePair[];
  formdata?: FormDataEntry[];
  binary?: BinaryBody;
}

export interface AuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';
  basic?: {
    username: string;
    password: string;
  };
  bearer?: {
    token: string;
  };
  apiKey?: {
    key: string;
    value: string;
    in: 'header' | 'query';
  };
  oauth2?: OAuth2Config & OAuth2TokenInfo;
}

export interface APIRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: KeyValuePair[];
  params: KeyValuePair[];
  body: RequestBody;
  auth: AuthConfig;
  description?: string;
  parentId?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  type: 'folder' | 'request';
  request?: APIRequest;
  children?: Collection[];
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValuePair[];
  isActive: boolean;
}

export interface AppSettings {
  theme: string;
  followRedirects: boolean;
  validateSSL: boolean;
  requestTimeout: number;
  maxRedirects: number;
  useKeychain: boolean;
}

export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  contentType: string;
  size: number;
  time: number;
  redirects: string[];
  finalUrl: string;
}

export interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

export interface PostmanItem {
  name: string;
  description?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
}

export interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  url: PostmanUrl | string;
  body?: PostmanBody;
  auth?: PostmanAuth;
}

export interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQuery[];
}

export interface PostmanQuery {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface PostmanBody {
  mode: string;
  raw?: string;
  urlencoded?: PostmanFormData[];
  formdata?: PostmanFormData[];
  file?: {
    src: string;
  };
}

export interface PostmanFormData {
  key: string;
  value?: string;
  src?: string;
  type?: string;
  description?: string;
  disabled?: boolean;
}

export interface PostmanAuth {
  type: string;
  bearer?: { token: string }[];
  basic?: { username: string; password: string }[];
  apikey?: { key: string; value: string; in: string }[];
  oauth2?: PostmanOAuth2[];
}

export interface PostmanOAuth2 {
  key: string;
  value: string;
  type: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  description?: string;
}

export interface ThemePalette {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
}

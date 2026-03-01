import { ApiRequest, RequestMode } from '../../shared/types';

export type EditorType = 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary';

export interface RequestEditorsConfig {
  factoryConfig: RequestEditorFactoryConfig;
  stateConfig: RequestEditorStateConfig;
  validatorConfig: RequestEditorValidatorConfig;
  syncConfig: RequestEditorSyncConfig;
  onStateChange?: (state: any) => void;
}

export interface RequestEditorFactoryConfig {
  jsonConfig: JsonEditorConfig;
  rawConfig: RawEditorConfig;
  formDataConfig: FormDataEditorConfig;
  urlEncodedConfig: UrlEncodedEditorConfig;
  binaryConfig: BinaryEditorConfig;
}

export interface RequestEditorStateConfig {
  persistState: boolean;
  debounceMs: number;
  defaultEditor: EditorType;
}

export interface RequestEditorValidatorConfig {
  validateOnChange: boolean;
  showInlineErrors: boolean;
  validationRules: Record<EditorType, ValidationRule[]>;
}

export interface RequestEditorSyncConfig {
  autoSyncHeaders: boolean;
  syncContentType: boolean;
  syncContentLength: boolean;
}

export interface JsonEditorConfig {
  enableValidation: boolean;
  enableBeautify: boolean;
  theme: string;
}

export interface RawEditorConfig {
  enableLineNumbers: boolean;
  enableWordWrap: boolean;
  theme: string;
}

export interface FormDataEditorConfig {
  enableFileUpload: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
}

export interface UrlEncodedEditorConfig {
  enableValidation: boolean;
  showPreview: boolean;
}

export interface BinaryEditorConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
  showPreview: boolean;
}

export interface ValidationRule {
  name: string;
  validate: (content: any) => ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export interface EditorState {
  activeEditor: EditorType;
  editorContents: Record<EditorType, any>;
  preferences: Record<string, any>;
  lastValidation: Record<EditorType, ValidationResult>;
}

export interface ParamsEditorConfig {
  enableBulkEdit: boolean;
  enableSuggestions: boolean;
}

export interface HeadersEditorConfig {
  enableSuggestions: boolean;
  commonHeaders: string[];
}

export interface AuthEditorConfig {
  supportedTypes: string[];
  oauthConfig: OAuthConfig;
}

export interface OAuthConfig {
  enableAutoRefresh: boolean;
  tokenStorage: 'memory' | 'persistent';
  flowTypes: string[];
}

export interface RequestBody {
  type: EditorType;
  content: any;
}

export interface RequestStateCache {
  tabId: string;
  request: ApiRequest;
  collectionId?: string;
  variableContext: VariableContext;
  requestMode?: RequestMode;
  restDraft?: ApiRequest;
  soapDraft?: ApiRequest;
  activeDetailsTab?: string;
  timestamp: number;
}

export interface VariableContext {
  activeEnvironment?: any;
  globals: any;
  folderVars: Record<string, string>;
}

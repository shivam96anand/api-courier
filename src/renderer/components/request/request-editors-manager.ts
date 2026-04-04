import { ApiRequest, SoapCerts } from '../../../shared/types';
import { RequestEditorsConfig, EditorType } from '../../types/request-types';
import { RequestEditorFactory } from './editors/RequestEditorFactory';
import { RequestEditorState } from './editors/RequestEditorState';
import { RequestEditorValidator } from './editors/RequestEditorValidator';
import { RequestEditorSync } from './editors/RequestEditorSync';
import { ParamsManager } from './editors/ParamsManager';
import { HeadersManager } from './editors/HeadersManager';
import { RequestBodyEditor } from './RequestBodyEditor';
import { AuthConfigManager } from './AuthConfigManager';
import { OAuth2Manager } from './OAuth2Manager';
import { VariableResolver } from './VariableResolver';
import { UIHelpers } from './UIHelpers';
import { SoapCertsManager } from './SoapCertsManager';

export class RequestEditorsManager {
  private factory!: RequestEditorFactory;
  private state!: RequestEditorState;
  private validator!: RequestEditorValidator;
  private sync!: RequestEditorSync;
  private paramsManager!: ParamsManager;
  private headersManager!: HeadersManager;
  private bodyEditor: RequestBodyEditor | null = null;
  private activeEditor: EditorType = 'json';
  private onRequestUpdate: (updates: Partial<ApiRequest>) => void;
  
  // New modular components
  private authConfigManager!: AuthConfigManager;
  private oauth2Manager!: OAuth2Manager;
  private variableResolver!: VariableResolver;
  private uiHelpers!: UIHelpers;
  private soapCertsManager!: SoapCertsManager;
  private isContentTypeSyncEnabled = true;

  constructor(onRequestUpdate: (updates: Partial<ApiRequest>) => void) {
    this.onRequestUpdate = onRequestUpdate;
    this.initializeComponents();
  }

  private initializeComponents(): void {
    const config: RequestEditorsConfig = {
      factoryConfig: {
        jsonConfig: { enableValidation: true, enableBeautify: true, theme: 'default' },
        rawConfig: { enableLineNumbers: true, enableWordWrap: true, theme: 'default' },
        formDataConfig: { enableFileUpload: true, maxFileSize: 10485760, allowedFileTypes: ['*'] },
        urlEncodedConfig: { enableValidation: true, showPreview: true },
        binaryConfig: { maxFileSize: 10485760, allowedFileTypes: ['*'], showPreview: true }
      },
      stateConfig: {
        persistState: true,
        debounceMs: 300,
        defaultEditor: 'json'
      },
      validatorConfig: {
        validateOnChange: true,
        showInlineErrors: true,
        validationRules: {
          'json': [],
          'raw': [],
          'form-data': [],
          'x-www-form-urlencoded': [],
          'binary': []
        }
      },
      syncConfig: {
        autoSyncHeaders: true,
        syncContentType: true,
        syncContentLength: false
      }
    };

    // Find container elements from DOM
    const editorsContainer = document.getElementById('request-editors') || document.body;
    const paramsContainer = document.getElementById('params-section') || document.body;
    const headersContainer = document.getElementById('headers-section') || document.body;

    this.factory = new RequestEditorFactory(editorsContainer, config.factoryConfig);
    this.state = new RequestEditorState(config.stateConfig);
    this.validator = new RequestEditorValidator(config.validatorConfig);
    this.sync = new RequestEditorSync(config.syncConfig);
    this.paramsManager = new ParamsManager(paramsContainer);
    this.headersManager = new HeadersManager(headersContainer);

    // Initialize new modular components
    this.uiHelpers = new UIHelpers();
    this.variableResolver = new VariableResolver();
    this.oauth2Manager = new OAuth2Manager(
      (config) => {
        this.onRequestUpdate({
          auth: {
            type: 'oauth2',
            config
          }
        });
      },
      this.variableResolver,
      this.uiHelpers
    );
    this.authConfigManager = new AuthConfigManager(
      (auth) => this.onRequestUpdate({ auth: auth as any }),
      this.oauth2Manager,
      this.uiHelpers
    );

    this.soapCertsManager = new SoapCertsManager(
      (soapCerts) => this.onRequestUpdate({ soapCerts })
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.factory.onEditorChange((editor) => this.handleEditorChange());
    this.state.onStateChange((state) => this.handleStateChange(state));
    this.validator.onValidationChange((result) => this.handleValidationChange(result));
    this.sync.onHeaderSync((headers) => this.handleHeaderSync(headers));
    
    this.paramsManager.onUpdate((params) => this.onRequestUpdate({ params }));
    this.headersManager.onUpdate((headers) => this.onRequestUpdate({ headers }));
  }

  private handleEditorChange(): void {
    const currentContent = this.getEditorContent();
    this.sync.syncHeaders(currentContent, this.activeEditor);
  }

  private handleStateChange(state: any): void {
    // Handle state persistence - could save to localStorage or trigger callbacks
  }

  private handleValidationChange(result: any): void {
    this.displayValidationResult(result);
  }

  private handleHeaderSync(headers: Record<string, string>): void {
    // Update headers in the headers manager
    Object.entries(headers).forEach(([key, value]) => {
      this.headersManager.updateHeader(key, value);
    });
  }

  private displayValidationResult(result: any): void {
    // Update UI with validation feedback
    const statusElement = document.querySelector('.validation-status');
    if (statusElement) {
      statusElement.textContent = result.isValid ? 'Valid' : result.error;
      statusElement.className = `validation-status ${result.isValid ? 'valid' : 'invalid'}`;
    }
  }

  public switchEditor(type: EditorType): void {
    if (this.activeEditor === type) return;

    const currentContent = this.getEditorContent();
    this.factory.switchEditor(this.activeEditor, type, currentContent);
    this.activeEditor = type;
    this.state.setActiveEditor(type);
  }

  public setContent(body: { type: string; content: any; format?: string; contentType?: string }): void {
    if (this.bodyEditor) {
      this.bodyEditor.setBody({
        type: body.type as any,
        content: body.content,
        format: body.format as any,
        contentType: body.contentType
      });
    }
  }

  public getContent(): { type: string; content: any; format?: string; contentType?: string } | null {
    if (this.bodyEditor) {
      return this.bodyEditor.getBody();
    }
    return null;
  }

  private getEditorContent(): any {
    const editor = this.factory.getEditor(this.activeEditor);
    return editor?.getContent() || null;
  }

  setupParamsEditor(): void {
    // ParamsManager handles this now
  }

  setupHeadersEditor(): void {
    // HeadersManager handles this now
  }

  setupBodyEditor(): void {
    const bodySection = document.getElementById('request-body-editor-host') || document.getElementById('body-section');
    if (!bodySection) return;

    // Initialize the enhanced body editor (keeping existing implementation)
    this.bodyEditor = new RequestBodyEditor(bodySection, {
      onBodyChange: (body) => {
        if (this.isContentTypeSyncEnabled) {
          this.syncContentTypeHeader(body.contentType);
        }
        this.onRequestUpdate({ body });
      },
      onContentTypeChange: (contentType) => {
        if (this.isContentTypeSyncEnabled) {
          this.syncContentTypeHeader(contentType || undefined);
        }
      },
      onStatusUpdate: (type, message) => {
        if (type === 'error') {
          console.error('Body editor error:', message);
        }
      }
    });
  }

  setupAuthEditor(): void {
    this.authConfigManager.setup();
  }

  private addParamRow(): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    paramsEditor.appendChild(row);
  }

  private addHeaderRow(): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    headersEditor.appendChild(row);
  }

  private updateParamsFromDOM(): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    const params: Record<string, string> = {};
    const rows = paramsEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (checkbox && checkbox.checked && keyInput && valueInput && keyInput.value.trim()) {
        params[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    this.onRequestUpdate({ params });
  }

  private updateHeadersFromDOM(): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    const headers: Record<string, string> = {};
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (checkbox && checkbox.checked && keyInput && valueInput && keyInput.value.trim()) {
        headers[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    this.onRequestUpdate({ headers });
  }

  loadParams(params: Record<string, string>): void {
    this.paramsManager.loadParams(params);
  }

  loadHeaders(headers: Record<string, string>): void {
    this.headersManager.loadHeaders(headers);
  }

  loadBody(body: { type: string; content: string; format?: string; contentType?: string }): void {
    this.setContent(body);
  }

  loadAuth(auth: { type: string; config: Record<string, string> }, collectionId?: string): void {
    this.authConfigManager.load(auth, collectionId);
  }

  setupCertsEditor(): void {
    // SoapCertsManager renders on demand; no persistent setup needed
  }

  loadCerts(certs: SoapCerts): void {
    const container = document.getElementById('auth-section');
    if (!container) return;
    this.soapCertsManager.render(container, certs);
  }

  clearCerts(): void {
    this.soapCertsManager.clear();
  }

  private updateRowVisualState(checkbox: HTMLInputElement): void {
    const row = checkbox.closest('.kv-row');
    if (row) {
      if (checkbox.checked) {
        row.classList.remove('disabled');
      } else {
        row.classList.add('disabled');
      }
    }
  }

  clearEditors(): void {
    if (this.bodyEditor) {
      this.bodyEditor.setForcedContentType(undefined);
      this.bodyEditor.clear();
    }

    this.paramsManager.clear();
    this.headersManager.clear();
    this.authConfigManager.clear();
    this.soapCertsManager.clear();

    // Clear OAuth UI elements when switching tabs to prevent data leaking
    this.uiHelpers.toggleOAuthStatus(false);
    this.uiHelpers.clearTokenInfo();
  }

  /**
   * Set variable context for highlighting in params, headers, and body editors
   */
  setVariableContext(activeEnvironment: any, globals: any, folderVars?: any): void {
    this.paramsManager.setVariableContext(activeEnvironment, globals, folderVars);
    this.headersManager.setVariableContext(activeEnvironment, globals, folderVars);
    if (this.bodyEditor) {
      this.bodyEditor.setVariableContext(activeEnvironment, globals, folderVars);
    }
  }

  // Delegate OAuth methods to AuthConfigManager
  isOAuthTokenExpired(auth: { type: string; config: Record<string, string> }): boolean {
    return this.authConfigManager.isOAuthTokenExpired(auth);
  }

  async autoRefreshOAuthToken(auth: { type: string; config: Record<string, string> }): Promise<{ type: string; config: Record<string, string> } | null> {
    return this.authConfigManager.autoRefreshOAuthToken(auth);
  }

  async autoGetOAuthToken(auth: { type: string; config: Record<string, string> }): Promise<{ type: string; config: Record<string, string> } | null> {
    return this.authConfigManager.autoGetOAuthToken(auth);
  }

  updateOAuthStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    this.uiHelpers.updateOAuthStatus(message, type);
  }

  updateTokenInfo(config: Record<string, string>): void {
    this.uiHelpers.updateTokenInfo(config);
  }

  setContentTypeSyncEnabled(enabled: boolean): void {
    this.isContentTypeSyncEnabled = enabled;
  }

  setBodySoapMode(enabled: boolean, forcedContentType?: string): void {
    const bodySection = document.getElementById('body-section');
    if (bodySection) {
      bodySection.classList.toggle('soap-mode', enabled);
    }
    if (this.bodyEditor) {
      this.bodyEditor.setForcedContentType(enabled ? forcedContentType : undefined);
    }
  }

  focusBodyEditor(): void {
    this.bodyEditor?.focusEditor();
  }

  upsertHeader(key: string, value: string): void {
    this.headersManager.updateHeader(key, value);
  }

  removeHeader(key: string): void {
    this.headersManager.removeHeader(key);
  }

  private syncContentTypeHeader(contentType?: string | null): void {
    if (!this.headersManager) return;

    if (contentType) {
      this.headersManager.updateHeader('Content-Type', contentType);
    } else {
      this.headersManager.removeHeader('Content-Type');
    }
  }
}

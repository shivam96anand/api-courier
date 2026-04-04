import { ApiRequest, KeyValuePair, RequestMode, RequestTab, SoapRequestConfig } from '../../shared/types';
import { RequestFormHandler } from './request/request-form-handler';
import { RequestEditorsManager } from './request/request-editors-manager';
import { RequestDataManager } from './request/request-data-manager';
import { buildFolderVars } from './request/variable-helper';
import { RequestStateCache, VariableContext } from '../types/request-types';

const SOAP_CONTENT_TYPE_11 = 'text/xml; charset=utf-8';
const SOAP_CONTENT_TYPE_12 = 'application/soap+xml; charset=utf-8';
const SOAP_HEADER_ACTION = 'SOAPAction';
const SOAP_ENVELOPE_NS_11 = 'http://schemas.xmlsoap.org/soap/envelope/';
const SOAP_ENVELOPE_NS_12 = 'http://www.w3.org/2003/05/soap-envelope';

const AUTO_SOAP_CONTENT_TYPES = new Set([
  SOAP_CONTENT_TYPE_11,
  SOAP_CONTENT_TYPE_12,
  'text/xml',
  'application/xml',
  'application/json',
]);

const REQUEST_DETAILS_TRANSITION_MS = 200;

export class RequestManager {
  private formHandler: RequestFormHandler;
  private editorsManager: RequestEditorsManager;
  private dataManager: RequestDataManager;
  private storeCache: any = null;
  private storeCacheTime: number = 0;
  private readonly CACHE_TTL = 500; // Cache for 500ms
  private requestStateCache: Map<string, RequestStateCache> = new Map();
  private readonly REQUEST_CACHE_TTL = 5000; // Cache request state for 5 seconds
  private currentTabId?: string;
  private currentCollectionId?: string;
  private currentMode: RequestMode = 'rest';
  private currentRestDraft: ApiRequest | null = null;
  private currentSoapDraft: ApiRequest | null = null;
  private lastRestDetailsTab = 'params';
  private lastRestFocusedElementId = 'request-url';

  constructor() {
    this.formHandler = new RequestFormHandler(
      (updates) => this.updateRequest(updates)
    );

    this.editorsManager = new RequestEditorsManager(
      (updates) => this.updateRequest(updates)
    );

    this.dataManager = new RequestDataManager(
      (message) => this.formHandler.showError(message),
      this.editorsManager
    );
  }

  private updateRequest(updates: Partial<ApiRequest>): void {
    const normalizedUpdates = this.currentMode === 'soap'
      ? { ...updates, method: 'POST' as const }
      : updates;

    this.dataManager.updateCurrentRequest(normalizedUpdates);

    const currentRequest = this.dataManager.getCurrentRequest();
    if (currentRequest) {
      if (this.currentMode === 'soap') {
        this.currentSoapDraft = this.cloneRequest(currentRequest);
      } else {
        this.currentRestDraft = this.cloneRequest(currentRequest);
      }
      this.validateRequestState(currentRequest);
    }

    this.refreshCacheForActiveTab();
  }

  initialize(): void {
    this.formHandler.setupRequestForm();
    this.formHandler.setupRequestTabs();
    this.dataManager.setupSendButton();
    this.dataManager.setupSwitchToSoapButton();
    this.dataManager.setupCurlTab();
    this.dataManager.setupCancelButton();
    this.dataManager.setupCancelEventListener();
    this.dataManager.setupTabChangeListener();

    this.editorsManager.setupParamsEditor();
    this.editorsManager.setupHeadersEditor();
    this.editorsManager.setupBodyEditor();
    this.editorsManager.setupAuthEditor();

    this.setupModeHandlers();
    this.setupSoapControls();
    this.setupRestFocusTracking();

    this.formHandler.showEmptyState();
    this.refreshCurrentVariableContext();

    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = (customEvent.detail.activeTab || null) as RequestTab | null;
      void this.loadRequest(activeTab);
    });

    document.addEventListener('active-details-tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeDetailsTab = customEvent.detail.activeDetailsTab;
      if (this.currentMode === 'rest' && activeDetailsTab) {
        this.lastRestDetailsTab = activeDetailsTab;
      }
      this.updateSoapControlsVisibility(activeDetailsTab);
    });

    // Invalidate cache when environments or collections change
    document.addEventListener('environment-changed', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
      void this.refreshCurrentVariableContext();
    });

    document.addEventListener('collection-updated', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
    });

    document.addEventListener('globals-updated', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
      void this.refreshCurrentVariableContext();
    });
  }

  private setupModeHandlers(): void {
    document.addEventListener('request-mode-toggle-clicked', () => {
      void this.toggleRequestMode();
    });
  }

  private setupRestFocusTracking(): void {
    const requestPanel = document.querySelector('.request-panel');
    if (!requestPanel) return;

    requestPanel.addEventListener('focusin', (event) => {
      if (this.currentMode !== 'rest') return;
      const target = event.target as HTMLElement | null;
      if (!target || !target.id) return;
      this.lastRestFocusedElementId = target.id;
    });
  }

  private setupSoapControls(): void {
    const soapVersion = document.getElementById('soap-version') as HTMLSelectElement | null;
    const soapAction = document.getElementById('soap-action') as HTMLInputElement | null;
    const formatXmlBtn = document.getElementById('soap-format-xml') as HTMLButtonElement | null;

    soapVersion?.addEventListener('change', () => {
      if (this.currentMode !== 'soap') return;
      void this.applySoapConfigUpdate({ version: soapVersion.value === '1.1' ? '1.1' : '1.2' });
    });

    soapAction?.addEventListener('input', () => {
      if (this.currentMode !== 'soap') return;
      void this.applySoapConfigUpdate({ action: soapAction.value });
    });

    formatXmlBtn?.addEventListener('click', () => {
      if (this.currentMode !== 'soap') return;
      this.formatSoapXmlBody();
    });
  }

  private async toggleRequestMode(): Promise<void> {
    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest || !this.currentTabId) return;

    if (this.currentMode === 'rest') {
      this.currentRestDraft = this.cloneRequest(currentRequest);
      const nextSoapDraft = this.currentSoapDraft
        ? this.cloneRequest(this.currentSoapDraft)
        : this.createSoapDraft(this.currentRestDraft);
      this.currentSoapDraft = this.ensureSoapRequestShape(nextSoapDraft, true);
      await this.switchToMode('soap', this.currentSoapDraft, 'body');
      return;
    }

    this.currentSoapDraft = this.cloneRequest(currentRequest);
    const nextRestDraft = this.currentRestDraft
      ? this.cloneRequest(this.currentRestDraft)
      : this.createRestDraft(this.currentSoapDraft);
    this.currentRestDraft = nextRestDraft;
    await this.switchToMode('rest', this.currentRestDraft, this.lastRestDetailsTab || 'params');
  }

  private async switchToMode(mode: RequestMode, request: ApiRequest, activeDetailsTab: string): Promise<void> {
    this.currentMode = mode;
    this.dataManager.setRequestMode(mode);

    const requestForMode = this.cloneRequest(request);
    this.dataManager.setCurrentRequest(requestForMode);

    const cachedState = this.currentTabId ? this.requestStateCache.get(this.currentTabId) : undefined;
    const variableContext = cachedState?.variableContext || await this.loadVariableContext(this.currentCollectionId);

    this.applyTransitionAnimation();
    this.renderRequestUI(requestForMode, variableContext, this.currentCollectionId, activeDetailsTab, mode);

    this.dispatchModeSwitchState(requestForMode, activeDetailsTab);
    this.cacheCurrentTabState(variableContext, activeDetailsTab);

    if (mode === 'soap') {
      setTimeout(() => {
        this.editorsManager.focusBodyEditor();
      }, REQUEST_DETAILS_TRANSITION_MS);
    } else {
      setTimeout(() => {
        this.restoreRestFocus();
      }, REQUEST_DETAILS_TRANSITION_MS);
    }
  }

  private async applySoapConfigUpdate(configUpdates: Partial<SoapRequestConfig>): Promise<void> {
    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest) return;

    const nextRequest = this.cloneRequest(currentRequest);
    nextRequest.soap = {
      version: nextRequest.soap?.version || '1.2',
      action: nextRequest.soap?.action || '',
      ...configUpdates,
    };

    const previousContentType = this.getHeaderValue(nextRequest.headers, 'Content-Type');
    const previousVersion = currentRequest.soap?.version;

    this.applySoapHeaders(nextRequest, previousVersion, previousContentType);
    nextRequest.body = this.ensureSoapBody(nextRequest.body, nextRequest.soap);
    if (configUpdates.version && nextRequest.body) {
      nextRequest.body.content = this.syncSoapEnvelopeNamespace(nextRequest.body.content || '', nextRequest.soap.version);
    }

    this.dataManager.setCurrentRequest(nextRequest);
    this.dataManager.updateCurrentRequest(nextRequest);

    this.editorsManager.loadHeaders(nextRequest.headers);
    if (configUpdates.version && nextRequest.body) {
      this.editorsManager.loadBody(nextRequest.body);
    }

    if (configUpdates.version) {
      this.syncSoapControls(nextRequest);
    }
    this.validateRequestState(nextRequest);
    this.refreshCacheForActiveTab();
  }

  private formatSoapXmlBody(): void {
    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest?.body?.content) return;

    const parseResult = this.parseXml(currentRequest.body.content);
    if (!parseResult.valid || !parseResult.document) {
      this.updateSoapValidationMessage(parseResult.error || 'Invalid XML body');
      this.dataManager.setRequestValidity(false, parseResult.error || 'Invalid XML body');
      return;
    }

    const formatted = this.prettyPrintXml(parseResult.document);
    const nextRequest = this.cloneRequest(currentRequest);
    nextRequest.body = {
      ...nextRequest.body,
      type: 'raw',
      format: 'xml',
      contentType: this.getSoapContentType(nextRequest.soap?.version || '1.2'),
      content: formatted,
    };

    this.dataManager.setCurrentRequest(nextRequest);
    this.dataManager.updateCurrentRequest(nextRequest);
    this.editorsManager.loadBody(nextRequest.body);
    this.validateRequestState(nextRequest);
    this.refreshCacheForActiveTab();
  }

  private applyTransitionAnimation(): void {
    const requestDetails = document.querySelector('.request-details') as HTMLElement | null;
    if (!requestDetails) return;

    requestDetails.classList.remove('mode-transition');
    void requestDetails.offsetWidth;
    requestDetails.classList.add('mode-transition');

    window.setTimeout(() => {
      requestDetails.classList.remove('mode-transition');
    }, REQUEST_DETAILS_TRANSITION_MS);
  }

  private dispatchModeSwitchState(request: ApiRequest, activeDetailsTab: string): void {
    document.dispatchEvent(new CustomEvent('request-mode-switched', {
      detail: {
        request: this.cloneRequest(request),
        requestMode: this.currentMode,
        restDraft: this.currentRestDraft ? this.cloneRequest(this.currentRestDraft) : undefined,
        soapDraft: this.currentSoapDraft ? this.cloneRequest(this.currentSoapDraft) : undefined,
        activeDetailsTab,
      }
    }));
  }

  private restoreRestFocus(): void {
    const target = document.getElementById(this.lastRestFocusedElementId) as HTMLElement | null;
    if (target) {
      target.focus();
      return;
    }

    const fallback = document.getElementById('request-url') as HTMLElement | null;
    fallback?.focus();
  }

  private async loadRequest(activeTab: RequestTab | null): Promise<void> {
    const tabId = activeTab?.id || null;
    const request = activeTab?.request || null;

    this.currentTabId = tabId || undefined;
    this.currentCollectionId = activeTab?.collectionId;
    this.currentMode = activeTab?.requestMode || 'rest';
    this.currentRestDraft = activeTab?.restDraft ? this.cloneRequest(activeTab.restDraft) : null;
    this.currentSoapDraft = activeTab?.soapDraft ? this.cloneRequest(activeTab.soapDraft) : null;

    this.dataManager.setRequestMode(this.currentMode);
    this.dataManager.setCurrentRequest(request);

    this.clearForm();

    if (!request || !tabId) {
      this.currentTabId = undefined;
      this.currentCollectionId = undefined;
      this.currentMode = 'rest';
      this.dataManager.setRequestMode('rest');
      this.formHandler.showEmptyState();
      return;
    }

    const cachedState = this.getCachedRequestState(tabId);
    if (cachedState) {
      const mergedCachedState: RequestStateCache = {
        ...cachedState,
        request,
        requestMode: activeTab?.requestMode || cachedState.requestMode || 'rest',
        restDraft: activeTab?.restDraft || cachedState.restDraft,
        soapDraft: activeTab?.soapDraft || cachedState.soapDraft,
      };

      this.requestStateCache.set(tabId, { ...mergedCachedState, timestamp: Date.now() });
      this.loadRequestFromCache(mergedCachedState, activeTab?.activeDetailsTab);
      return;
    }

    const variableContext = await this.loadVariableContext(activeTab?.collectionId);
    const mode = activeTab?.requestMode || 'rest';
    const detailsTab = this.resolveDetailsTab(mode, activeTab?.activeDetailsTab);

    this.renderRequestUI(request, variableContext, activeTab?.collectionId, detailsTab, mode);
    this.cacheRequestState(
      tabId,
      request,
      activeTab?.collectionId,
      variableContext,
      detailsTab,
      mode,
      activeTab?.restDraft,
      activeTab?.soapDraft
    );
  }

  private renderRequestUI(
    request: ApiRequest,
    variableContext: VariableContext,
    collectionId: string | undefined,
    activeDetailsTab: string,
    mode: RequestMode
  ): void {
    const normalizedRequest = mode === 'soap'
      ? this.ensureSoapRequestShape(this.cloneRequest(request), true)
      : this.cloneRequest(request);

    this.formHandler.showRequestForm();
    this.formHandler.loadBasicRequestData(normalizedRequest);

    this.applyModeUI(mode, normalizedRequest, activeDetailsTab);
    this.formHandler.restoreActiveDetailsTab(activeDetailsTab);

    this.editorsManager.setVariableContext(
      variableContext.activeEnvironment,
      variableContext.globals,
      variableContext.folderVars
    );
    this.formHandler.setVariableContext(variableContext);

    this.editorsManager.loadParams(normalizedRequest.params || {});
    this.editorsManager.loadHeaders(normalizedRequest.headers);

    if (normalizedRequest.body) {
      this.editorsManager.loadBody(normalizedRequest.body);
    }

    if (mode === 'soap') {
      this.editorsManager.loadCerts(normalizedRequest.soapCerts ?? {});
    } else {
      this.editorsManager.clearCerts();
      this.editorsManager.loadAuth(
        normalizedRequest.auth ?? { type: 'none', config: {} },
        collectionId
      );
    }

    this.dataManager.setCurrentRequest(normalizedRequest);
    this.validateRequestState(normalizedRequest);

    requestAnimationFrame(() => {
      this.formHandler.refreshAllInputHighlighting();
    });
  }

  private applyModeUI(mode: RequestMode, request: ApiRequest, activeDetailsTab?: string): void {
    this.currentMode = mode;
    this.dataManager.setRequestMode(mode);

    const switchBtn = document.getElementById('switch-to-soap') as HTMLButtonElement | null;
    if (switchBtn) {
      if (mode === 'soap') {
        switchBtn.textContent = 'Switch to REST';
        switchBtn.title = 'Switch to REST mode';
      } else {
        switchBtn.textContent = 'Switch to SOAP';
        switchBtn.title = 'Switch to SOAP';
      }
    }

    // Rename the Auth tab label based on mode
    const authTabBtn = document.querySelector('.tab[data-section="auth"]') as HTMLElement | null;
    if (authTabBtn) {
      authTabBtn.textContent = mode === 'soap' ? 'Certs' : 'Auth';
    }

    const methodSelect = document.getElementById('request-method') as HTMLSelectElement | null;
    if (methodSelect) {
      methodSelect.disabled = mode === 'soap';
      methodSelect.classList.toggle('locked', mode === 'soap');
      if (mode === 'soap') {
        methodSelect.value = 'POST';
      }
    }

    this.updateSoapControlsVisibility(activeDetailsTab || this.getCurrentActiveDetailsTab());

    if (mode === 'soap') {
      const soapVersion = request.soap?.version || '1.2';
      this.syncSoapControls(request);
      this.editorsManager.setContentTypeSyncEnabled(false);
      this.editorsManager.setBodySoapMode(true, this.getSoapContentType(soapVersion));
      return;
    }

    this.updateSoapValidationMessage('');
    this.editorsManager.setContentTypeSyncEnabled(true);
    this.editorsManager.setBodySoapMode(false);
  }

  private syncSoapControls(request: ApiRequest): void {
    const soapVersion = document.getElementById('soap-version') as HTMLSelectElement | null;
    const soapAction = document.getElementById('soap-action') as HTMLInputElement | null;
    const soapActionField = document.getElementById('soap-action-field');

    const version = request.soap?.version || '1.2';
    if (soapVersion) {
      soapVersion.value = version;
    }

    const showAction = version === '1.1';
    if (soapActionField) {
      soapActionField.style.display = showAction ? 'flex' : 'none';
    }

    if (soapAction) {
      soapAction.value = request.soap?.action || '';
    }
  }

  private resolveDetailsTab(mode: RequestMode, activeDetailsTab?: string): string {
    if (mode === 'soap') {
      return 'body';
    }

    if (activeDetailsTab) {
      return activeDetailsTab;
    }

    return this.lastRestDetailsTab || 'params';
  }

  private ensureSoapRequestShape(request: ApiRequest, initializeEnvelope: boolean): ApiRequest {
    const next = this.cloneRequest(request);
    next.method = 'POST';

    next.soap = {
      version: next.soap?.version || '1.2',
      action: next.soap?.action || '',
    };

    next.body = this.ensureSoapBody(next.body, next.soap, initializeEnvelope);

    const previousContentType = this.getHeaderValue(next.headers, 'Content-Type');
    this.applySoapHeaders(next, next.soap.version, previousContentType);

    return next;
  }

  private ensureSoapBody(
    body: ApiRequest['body'],
    soapConfig: SoapRequestConfig,
    initializeEnvelope: boolean = false
  ): ApiRequest['body'] {
    const currentContent = body?.content?.trim() || '';

    if (!body || body.type === 'none') {
      return {
        type: 'raw',
        format: 'xml',
        contentType: this.getSoapContentType(soapConfig.version),
        content: this.buildSoapEnvelopeTemplate(soapConfig.version, soapConfig.action || ''),
      };
    }

    const shouldInjectTemplate = initializeEnvelope && !currentContent;
    return {
      ...body,
      type: 'raw',
      format: 'xml',
      contentType: this.getSoapContentType(soapConfig.version),
      content: shouldInjectTemplate
        ? this.buildSoapEnvelopeTemplate(soapConfig.version, soapConfig.action || '')
        : (body.content || ''),
    };
  }

  private applySoapHeaders(request: ApiRequest, previousVersion?: string, previousContentType?: string): void {
    const soapVersion = request.soap?.version || '1.2';
    const expectedContentType = this.getSoapContentType(soapVersion);

    if (this.shouldApplySoapContentType(previousContentType, previousVersion, soapVersion)) {
      request.headers = this.upsertHeader(request.headers, 'Content-Type', expectedContentType);
    }

    if (soapVersion === '1.1') {
      if ((request.soap?.action || '').trim()) {
        request.headers = this.upsertHeader(request.headers, SOAP_HEADER_ACTION, (request.soap?.action || '').trim());
      } else {
        request.headers = this.removeHeader(request.headers, SOAP_HEADER_ACTION);
      }
      return;
    }

    request.headers = this.removeHeader(request.headers, SOAP_HEADER_ACTION);
  }

  private shouldApplySoapContentType(
    currentContentType: string | undefined,
    previousVersion?: string,
    nextVersion?: string
  ): boolean {
    const normalized = (currentContentType || '').toLowerCase().split(';')[0].trim();

    if (!normalized) {
      return true;
    }

    if (AUTO_SOAP_CONTENT_TYPES.has(currentContentType || '')) {
      return true;
    }

    const previousSoapType = previousVersion ? this.getSoapContentType(previousVersion).toLowerCase().split(';')[0].trim() : '';
    const nextSoapType = nextVersion ? this.getSoapContentType(nextVersion).toLowerCase().split(';')[0].trim() : '';

    if (normalized === previousSoapType || normalized === nextSoapType) {
      return true;
    }

    return false;
  }

  private getSoapContentType(version: '1.1' | '1.2'): string {
    return version === '1.1' ? SOAP_CONTENT_TYPE_11 : SOAP_CONTENT_TYPE_12;
  }

  private buildSoapEnvelopeTemplate(version: '1.1' | '1.2', action: string): string {
    const envelopeNamespace = version === '1.2'
      ? SOAP_ENVELOPE_NS_12
      : SOAP_ENVELOPE_NS_11;
    const actionComment = action ? `<!-- SOAPAction: ${action} -->` : '<!-- SOAPAction -->';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="${envelopeNamespace}">\n  <soap:Header>\n    ${actionComment}\n  </soap:Header>\n  <soap:Body>\n    <m:Operation xmlns:m="http://tempuri.org/">\n      <m:Value></m:Value>\n    </m:Operation>\n  </soap:Body>\n</soap:Envelope>`;
  }

  private syncSoapEnvelopeNamespace(xml: string, version: '1.1' | '1.2'): string {
    const targetNamespace = version === '1.2' ? SOAP_ENVELOPE_NS_12 : SOAP_ENVELOPE_NS_11;
    if (!xml.trim()) return xml;

    const envelopeTagMatch = xml.match(/<([\w.-]+:)?Envelope\b[^>]*>/i);
    if (!envelopeTagMatch) return xml;

    const openingTag = envelopeTagMatch[0];
    const normalizedTag = openingTag
      .replace(new RegExp(SOAP_ENVELOPE_NS_11.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), targetNamespace)
      .replace(new RegExp(SOAP_ENVELOPE_NS_12.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), targetNamespace);

    if (normalizedTag === openingTag) {
      return xml;
    }

    return xml.replace(openingTag, normalizedTag);
  }

  private parseXml(xml: string): { valid: boolean; document?: Document; error?: string } {
    try {
      const parser = new DOMParser();
      const documentNode = parser.parseFromString(xml, 'application/xml');
      const parserError = documentNode.querySelector('parsererror');
      if (parserError) {
        return { valid: false, error: 'Invalid XML body. Check tags, attributes, and namespaces.' };
      }
      return { valid: true, document: documentNode };
    } catch {
      return { valid: false, error: 'Invalid XML body.' };
    }
  }

  private prettyPrintXml(documentNode: Document): string {
    const serializeNode = (node: Node, depth: number): string => {
      const indent = '  '.repeat(depth);

      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.nodeValue || '').trim();
        return text ? `${indent}${text}\n` : '';
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const el = node as Element;
      const attrs = Array.from(el.attributes)
        .map((attr) => `${attr.name}="${attr.value}"`)
        .join(' ');
      const openTag = attrs ? `<${el.tagName} ${attrs}>` : `<${el.tagName}>`;

      const childNodes = Array.from(el.childNodes)
        .filter((child) => child.nodeType === Node.ELEMENT_NODE || ((child.nodeType === Node.TEXT_NODE) && (child.nodeValue || '').trim()));

      if (childNodes.length === 0) {
        return `${indent}${openTag.replace('>', '/>')}\n`;
      }

      const hasOnlyText = childNodes.every((child) => child.nodeType === Node.TEXT_NODE);
      if (hasOnlyText) {
        const textContent = childNodes.map((child) => (child.nodeValue || '').trim()).join('');
        return `${indent}${openTag}${textContent}</${el.tagName}>\n`;
      }

      let content = `${indent}${openTag}\n`;
      childNodes.forEach((child) => {
        content += serializeNode(child, depth + 1);
      });
      content += `${indent}</${el.tagName}>\n`;
      return content;
    };

    const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const root = documentNode.documentElement;
    return `${declaration}${serializeNode(root, 0).trimEnd()}`;
  }

  private validateRequestState(request: ApiRequest): void {
    if (this.currentMode !== 'soap') {
      this.updateSoapValidationMessage('');
      this.dataManager.setRequestValidity(true);
      return;
    }

    const soapVersion = request.soap?.version || '1.2';
    const soapAction = (request.soap?.action || '').trim();
    const xmlBody = request.body?.content || '';

    if (soapVersion === '1.1' && !soapAction) {
      const message = 'SOAPAction is required for SOAP 1.1.';
      this.updateSoapValidationMessage(message);
      this.dataManager.setRequestValidity(false, message);
      return;
    }

    if (!xmlBody.trim()) {
      const message = 'SOAP XML body is required.';
      this.updateSoapValidationMessage(message);
      this.dataManager.setRequestValidity(false, message);
      return;
    }

    const parseResult = this.parseXml(xmlBody);
    if (!parseResult.valid) {
      const message = parseResult.error || 'Invalid XML body.';
      this.updateSoapValidationMessage(message);
      this.dataManager.setRequestValidity(false, message);
      return;
    }

    this.updateSoapValidationMessage('');
    this.dataManager.setRequestValidity(true);
  }

  private updateSoapValidationMessage(message: string): void {
    const validationElement = document.getElementById('soap-validation-message');
    if (!validationElement) return;
    validationElement.textContent = message;
  }

  private createSoapDraft(restDraft: ApiRequest): ApiRequest {
    const next = this.cloneRequest(restDraft);
    next.soap = {
      version: '1.2',
      action: '',
    };

    return this.ensureSoapRequestShape(next, true);
  }

  private createRestDraft(soapDraft: ApiRequest): ApiRequest {
    const next = this.cloneRequest(soapDraft);
    next.soap = undefined;

    if (next.method === 'POST') {
      next.method = 'GET';
    }

    next.headers = this.removeHeader(next.headers, SOAP_HEADER_ACTION);

    const contentType = this.getHeaderValue(next.headers, 'Content-Type');
    if (contentType && AUTO_SOAP_CONTENT_TYPES.has(contentType)) {
      next.headers = this.removeHeader(next.headers, 'Content-Type');
    }

    return next;
  }

  /**
   * Load request from cached state (synchronous, instant)
   */
  private loadRequestFromCache(cachedState: RequestStateCache, activeDetailsTab?: string): void {
    const { request, variableContext, collectionId } = cachedState;
    const mode = cachedState.requestMode || this.currentMode || 'rest';
    const detailsTab = this.resolveDetailsTab(mode, activeDetailsTab || cachedState.activeDetailsTab);

    this.renderRequestUI(request, variableContext, collectionId, detailsTab, mode);

    this.currentRestDraft = cachedState.restDraft ? this.cloneRequest(cachedState.restDraft) : this.currentRestDraft;
    this.currentSoapDraft = cachedState.soapDraft ? this.cloneRequest(cachedState.soapDraft) : this.currentSoapDraft;
  }

  /**
   * Load variable context and return it
   */
  private async loadVariableContext(collectionId?: string): Promise<VariableContext> {
    try {
      const state = await this.getCachedStore();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };
      const folderVars = buildFolderVars(collectionId, state.collections);

      return { activeEnvironment, globals, folderVars };
    } catch (error) {
      console.error('Failed to load variable context:', error);
      return { globals: { variables: {} }, folderVars: {} };
    }
  }

  /**
   * Get cached request state if available and fresh
   */
  private getCachedRequestState(tabId: string): RequestStateCache | null {
    const cached = this.requestStateCache.get(tabId);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.REQUEST_CACHE_TTL) {
      this.requestStateCache.delete(tabId);
      return null;
    }

    return cached;
  }

  /**
   * Cache request state for a tab
   */
  private cacheRequestState(
    tabId: string,
    request: ApiRequest,
    collectionId: string | undefined,
    variableContext: VariableContext,
    activeDetailsTab: string | undefined,
    requestMode: RequestMode,
    restDraft?: ApiRequest,
    soapDraft?: ApiRequest
  ): void {
    this.requestStateCache.set(tabId, {
      tabId,
      request,
      collectionId,
      variableContext,
      requestMode,
      restDraft,
      soapDraft,
      activeDetailsTab,
      timestamp: Date.now()
    });
  }

  private cacheCurrentTabState(variableContext: VariableContext, activeDetailsTab: string): void {
    if (!this.currentTabId) return;
    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest) return;

    this.cacheRequestState(
      this.currentTabId,
      currentRequest,
      this.currentCollectionId,
      variableContext,
      activeDetailsTab,
      this.currentMode,
      this.currentRestDraft || undefined,
      this.currentSoapDraft || undefined
    );
  }

  /**
   * Keep cached request in sync with latest edits so tab switches don't replay stale auth (tokens).
   */
  private refreshCacheForActiveTab(): void {
    if (!this.currentTabId) return;
    const cached = this.requestStateCache.get(this.currentTabId);
    if (!cached) return;

    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest) return;

    this.requestStateCache.set(this.currentTabId, {
      ...cached,
      request: currentRequest,
      requestMode: this.currentMode,
      restDraft: this.currentRestDraft || undefined,
      soapDraft: this.currentSoapDraft || undefined,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate request state cache
   */
  private invalidateRequestStateCache(): void {
    this.requestStateCache.clear();
  }


  /**
   * Get store data with caching to reduce IPC calls during rapid tab switching
   */
  private async getCachedStore(): Promise<any> {
    const now = Date.now();
    if (this.storeCache && (now - this.storeCacheTime) < this.CACHE_TTL) {
      return this.storeCache;
    }

    this.storeCache = await window.apiCourier.store.get();
    this.storeCacheTime = now;
    return this.storeCache;
  }

  /**
   * Invalidate store cache when data changes
   */
  private invalidateStoreCache(): void {
    this.storeCache = null;
    this.storeCacheTime = 0;
  }

  /**
   * Refresh variable context for current request when environment or globals change
   */
  private async refreshCurrentVariableContext(): Promise<void> {
    let collectionId: string | undefined;
    if (this.currentTabId) {
      const cachedState = this.requestStateCache.get(this.currentTabId);
      collectionId = cachedState?.collectionId;
    }

    const variableContext = await this.loadVariableContext(collectionId);

    this.editorsManager.setVariableContext(
      variableContext.activeEnvironment,
      variableContext.globals,
      variableContext.folderVars
    );
    this.formHandler.setVariableContext(variableContext);

    if (this.currentTabId && this.dataManager.getCurrentRequest()) {
      requestAnimationFrame(() => {
        this.formHandler.refreshAllInputHighlighting();
      });
    }
  }

  private clearForm(): void {
    this.formHandler.clearBasicForm();
    this.editorsManager.clearEditors();
    this.editorsManager.setBodySoapMode(false);
    this.editorsManager.setContentTypeSyncEnabled(true);
    this.updateSoapValidationMessage('');
    this.dataManager.setRequestValidity(true);

    this.updateSoapControlsVisibility();

    const switchBtn = document.getElementById('switch-to-soap') as HTMLButtonElement | null;
    if (switchBtn) {
      switchBtn.textContent = 'Switch to SOAP';
      switchBtn.title = 'Switch to SOAP';
    }

    const methodSelect = document.getElementById('request-method') as HTMLSelectElement | null;
    if (methodSelect) {
      methodSelect.disabled = false;
      methodSelect.classList.remove('locked');
    }
  }

  private cloneRequest(request: ApiRequest): ApiRequest {
    return {
      ...request,
      params: Array.isArray(request.params)
        ? request.params.map((param) => ({ ...param }))
        : request.params
          ? { ...request.params }
          : request.params,
      headers: Array.isArray(request.headers)
        ? request.headers.map((header) => ({ ...header }))
        : { ...request.headers },
      body: request.body ? { ...request.body } : request.body,
      auth: request.auth ? { ...request.auth, config: { ...request.auth.config } } : request.auth,
      soap: request.soap ? { ...request.soap } : request.soap,
      variables: request.variables ? { ...request.variables } : request.variables,
    };
  }

  private toHeaderPairs(headers: ApiRequest['headers']): KeyValuePair[] {
    if (Array.isArray(headers)) {
      return headers.map((header) => ({ ...header }));
    }

    return Object.entries(headers || {}).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
  }

  private getHeaderValue(headers: ApiRequest['headers'], key: string): string | undefined {
    const target = key.toLowerCase();
    const pairs = this.toHeaderPairs(headers);
    const match = pairs.find((header) => header.key.toLowerCase() === target && header.enabled !== false);
    return match?.value;
  }

  private upsertHeader(headers: ApiRequest['headers'], key: string, value: string): KeyValuePair[] {
    const pairs = this.toHeaderPairs(headers);
    const target = key.toLowerCase();
    const existing = pairs.find((header) => header.key.toLowerCase() === target);

    if (existing) {
      existing.value = value;
      existing.enabled = true;
      return pairs;
    }

    pairs.push({ key, value, enabled: true });
    return pairs;
  }

  private removeHeader(headers: ApiRequest['headers'], key: string): KeyValuePair[] {
    const target = key.toLowerCase();
    return this.toHeaderPairs(headers).filter((header) => header.key.toLowerCase() !== target);
  }

  private getCurrentActiveDetailsTab(): string {
    const activeTab = document.querySelector('.request-details .tab.active') as HTMLElement | null;
    return activeTab?.dataset.section || 'params';
  }

  private updateSoapControlsVisibility(activeDetailsTab?: string): void {
    const soapControls = document.getElementById('soap-controls');
    if (!soapControls) return;

    const activeTab = activeDetailsTab || this.getCurrentActiveDetailsTab();
    const shouldShow = this.currentMode === 'soap' && activeTab === 'body';
    soapControls.style.display = shouldShow ? 'block' : 'none';
  }
}

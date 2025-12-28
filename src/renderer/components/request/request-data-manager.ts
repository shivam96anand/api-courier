import { ApiRequest } from '../../../shared/types';
import { RequestEditorsManager } from './request-editors-manager';
import { UIHelpers } from './UIHelpers';
import { buildFolderVars } from './variable-helper';
import { resolveSystemVariable } from '../../../shared/system-variables';

export class RequestDataManager {
  private currentRequest: ApiRequest | null = null;
  private onShowError: (message: string) => void;
  private editorsManager?: RequestEditorsManager;
  private isSending = false;
  private cancelRequested = false;
  private hasEmittedCancellation = false;
  private uiHelpers = new UIHelpers();

  constructor(onShowError: (message: string) => void, editorsManager?: RequestEditorsManager) {
    this.onShowError = onShowError;
    this.editorsManager = editorsManager;
  }

  setupSendButton(): void {
    const sendBtn = document.getElementById('send-request');

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        await this.sendRequest();
      });
    }

    // Ensure buttons start in idle state
    this.toggleRequestButtons(false);
  }

  setupCopyCurlButton(): void {
    const copyBtn = document.getElementById('copy-curl');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await this.copyCurl();
      });
    }
  }

  setupCancelButton(): void {
    const cancelBtn = document.getElementById('cancel-request');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        await this.cancelRequest();
      });
    }
  }

  setupCancelEventListener(): void {
    document.addEventListener('request-cancel-trigger', async () => {
      await this.cancelRequest();
    });
  }

  setupTabChangeListener(): void {
    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;
      if (activeTab) {
        this.setCurrentRequest(activeTab.request);
      } else {
        this.setCurrentRequest(null);
      }
    });
  }

  setCurrentRequest(request: ApiRequest | null): void {
    this.currentRequest = request;
  }

  getCurrentRequest(): ApiRequest | null {
    return this.currentRequest;
  }

  updateCurrentRequest(updates: Partial<ApiRequest>): void {
    if (!this.currentRequest) return;

    console.log('[RequestDataManager] Updating request with:', {
      hasAuth: !!updates.auth,
      authType: updates.auth?.type,
      hasAccessToken: !!(updates.auth as any)?.config?.accessToken
    });

    this.currentRequest = { ...this.currentRequest, ...updates };

    console.log('[RequestDataManager] Current request after update has token:', !!(this.currentRequest.auth as any)?.config?.accessToken);

    const event = new CustomEvent('request-updated', {
      detail: { request: this.currentRequest }
    });
    document.dispatchEvent(event);
  }

  private async copyCurl(): Promise<void> {
    if (!this.currentRequest) {
      this.uiHelpers.showToast('No request to copy');
      return;
    }

    if (!this.currentRequest.url) {
      this.uiHelpers.showToast('Request URL is empty');
      return;
    }

    const resolvedRequest = await this.resolveRequestVariables(this.currentRequest);
    const curlCommand = this.buildCurlCommand(resolvedRequest);

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(curlCommand);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = curlCommand;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      this.uiHelpers.showToast('cURL copied to clipboard');
    } catch (error) {
      console.error('Failed to copy cURL:', error);
      this.uiHelpers.showToast('Failed to copy cURL');
    }
  }

  private buildCurlCommand(request: ApiRequest): string {
    const method = request.method || 'GET';
    const { url, headerArgs, bodyArg } = this.buildCurlParts(request);
    const parts = ['curl', '-X', method, this.shellEscape(url)];

    headerArgs.forEach((header) => {
      parts.push('-H', this.shellEscape(header));
    });

    if (bodyArg) {
      parts.push('--data-raw', this.shellEscape(bodyArg));
    }

    return parts.join(' ');
  }

  private buildCurlParts(request: ApiRequest): { url: string; headerArgs: string[]; bodyArg?: string } {
    const headers = this.buildHeaders(request);
    const { bodyData, contentType } = this.buildBody(request);
    const headerArgs: string[] = [];

    if (contentType && !this.hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = contentType;
    }

    Object.entries(headers).forEach(([key, value]) => {
      if (key.trim() && value.trim()) {
        headerArgs.push(`${key.trim()}: ${value.trim()}`);
      }
    });

    const url = this.buildUrlWithParams(request.url, request.params, this.buildAuthQueryParams(request));
    return { url, headerArgs, bodyArg: bodyData || undefined };
  }

  private async resolveRequestVariables(request: ApiRequest): Promise<ApiRequest> {
    try {
      const state = await window.apiCourier.store.get();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;
      const globals = state.globals || { variables: {} };
      const folderVars = buildFolderVars(request.collectionId, state.collections || []);
      const requestVars = request.variables || {};

      const resolve = (input: string) => this.resolveTemplate(input, {
        requestVars,
        folderVars,
        envVars: activeEnvironment?.variables || {},
        globalVars: globals.variables || {}
      });

      const resolved: ApiRequest = {
        ...request,
        url: resolve(request.url || ''),
        params: this.resolveParamsOrHeaders(request.params, resolve),
        headers: this.resolveParamsOrHeaders(request.headers, resolve),
        body: request.body
          ? {
              ...request.body,
              content: resolve(request.body.content || ''),
              contentType: request.body.contentType ? resolve(request.body.contentType) : request.body.contentType
            }
          : undefined,
        auth: request.auth
          ? {
              ...request.auth,
              config: this.resolveObject(request.auth.config || {}, resolve)
            }
          : undefined
      };

      return resolved;
    } catch (error) {
      console.error('Failed to resolve request variables for cURL:', error);
      return request;
    }
  }

  private resolveParamsOrHeaders(
    input: ApiRequest['params'] | ApiRequest['headers'],
    resolve: (value: string) => string
  ): ApiRequest['params'] | ApiRequest['headers'] {
    if (!input) return input;

    if (Array.isArray(input)) {
      return input.map(({ key, value, enabled }) => ({
        key: resolve(key),
        value: resolve(value),
        enabled
      }));
    }

    return this.resolveObject(input, resolve);
  }

  private resolveObject(
    input: Record<string, string>,
    resolve: (value: string) => string
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    Object.entries(input).forEach(([key, value]) => {
      resolved[resolve(key)] = resolve(value);
    });
    return resolved;
  }

  private resolveTemplate(
    input: string,
    vars: {
      requestVars: Record<string, string>;
      folderVars: Record<string, string>;
      envVars: Record<string, string>;
      globalVars: Record<string, string>;
    },
    maxDepth = 5
  ): string {
    const pattern = /{{\s*([a-zA-Z0-9_\-.]+)(?::([^}]+))?\s*}}/g;
    let output = input;

    for (let depth = 0; depth < maxDepth; depth++) {
      let changed = false;

      output = output.replace(pattern, (match, varName, defaultValue) => {
        let value: string | undefined;

        if (varName in vars.requestVars) {
          value = vars.requestVars[varName];
        } else if (varName in vars.envVars) {
          value = vars.envVars[varName];
        } else if (varName in vars.folderVars) {
          value = vars.folderVars[varName];
        } else if (varName in vars.globalVars) {
          value = vars.globalVars[varName];
        } else {
          const systemValue = resolveSystemVariable(varName);
          if (systemValue !== undefined) {
            value = systemValue;
          }
        }

        if (value === undefined && defaultValue !== undefined) {
          value = defaultValue;
        } else if (value === undefined) {
          return match;
        }

        changed = changed || value !== match;
        return String(value);
      });

      if (!changed) break;
    }

    return output;
  }

  private buildHeaders(request: ApiRequest): Record<string, string> {
    const cleanHeaders: Record<string, string> = {};

    if (request.headers) {
      if (Array.isArray(request.headers)) {
        request.headers.forEach(({ key, value, enabled }) => {
          if (enabled && key.trim() && value.trim()) {
            cleanHeaders[key.trim()] = value.trim();
          }
        });
      } else {
        Object.entries(request.headers).forEach(([key, value]) => {
          if (key.trim() && value.trim()) {
            cleanHeaders[key.trim()] = value.trim();
          }
        });
      }
    }

    if (request.auth?.type === 'oauth2' && request.auth.config.accessToken) {
      const headerPrefix = request.auth.config.headerPrefix || 'Bearer';
      cleanHeaders['Authorization'] = `${headerPrefix} ${request.auth.config.accessToken}`;
    }

    if (request.auth?.type === 'bearer' && request.auth.config.token) {
      cleanHeaders['Authorization'] = `Bearer ${request.auth.config.token}`;
    }

    if (request.auth?.type === 'api-key' && request.auth.config.location === 'header') {
      const key = request.auth.config.key || 'X-API-Key';
      if (request.auth.config.value) {
        cleanHeaders[key] = request.auth.config.value;
      }
    }

    if (request.auth?.type === 'basic' && request.auth.config.username && request.auth.config.password) {
      const credentials = `${request.auth.config.username}:${request.auth.config.password}`;
      const encoded = btoa(credentials);
      cleanHeaders['Authorization'] = `Basic ${encoded}`;
    }

    return cleanHeaders;
  }

  private buildAuthQueryParams(request: ApiRequest): Record<string, string> {
    if (request.auth?.type === 'api-key' && request.auth.config.location === 'query') {
      const key = request.auth.config.key || 'api_key';
      const value = request.auth.config.value || '';
      if (key.trim() && value.trim()) {
        return { [key]: value };
      }
    }

    return {};
  }

  private buildBody(request: ApiRequest): { bodyData?: string; contentType?: string } {
    if (!request.body || request.body.type === 'none') {
      return {};
    }

    const bodyData = request.body.content || '';
    const contentType = this.resolveContentType(request.body);

    return { bodyData, contentType };
  }

  private resolveContentType(body: ApiRequest['body']): string | undefined {
    if (!body) return undefined;

    if (body.contentType) {
      return body.contentType;
    }

    switch (body.format) {
      case 'json':
        return 'application/json';
      case 'xml':
        return 'application/xml';
      case 'yaml':
        return 'application/x-yaml';
      case 'text':
        return 'text/plain';
      case 'form-urlencoded':
        return 'application/x-www-form-urlencoded';
      default:
        break;
    }

    switch (body.type) {
      case 'json':
        return 'application/json';
      case 'form-urlencoded':
        return 'application/x-www-form-urlencoded';
      default:
        return undefined;
    }
  }

  private buildUrlWithParams(
    baseUrl: string,
    params?: ApiRequest['params'],
    extraParams?: Record<string, string>
  ): string {
    const mergedParams = this.collectParams(params, extraParams);
    if (mergedParams.length === 0) {
      return baseUrl;
    }

    const hasTemplateVars = baseUrl.includes('{{');
    if (hasTemplateVars) {
      return this.appendParamsWithoutEncoding(baseUrl, mergedParams);
    }

    try {
      const [urlWithoutHash, hash] = baseUrl.split('#');
      const [path, queryString = ''] = urlWithoutHash.split('?');
      const searchParams = new URLSearchParams(queryString);

      mergedParams.forEach(({ key, value }) => {
        searchParams.set(key, value);
      });

      const query = searchParams.toString();
      const rebuilt = query ? `${path}?${query}` : path;
      return hash ? `${rebuilt}#${hash}` : rebuilt;
    } catch {
      return this.appendParamsWithoutEncoding(baseUrl, mergedParams);
    }
  }

  private collectParams(
    params?: ApiRequest['params'],
    extraParams?: Record<string, string>
  ): Array<{ key: string; value: string }> {
    const merged: Array<{ key: string; value: string }> = [];

    if (params) {
      if (Array.isArray(params)) {
        params.forEach(({ key, value, enabled }) => {
          if (enabled && key.trim() && value.trim()) {
            merged.push({ key: key.trim(), value: value.trim() });
          }
        });
      } else {
        Object.entries(params).forEach(([key, value]) => {
          if (key.trim() && value.trim()) {
            merged.push({ key: key.trim(), value: value.trim() });
          }
        });
      }
    }

    if (extraParams) {
      Object.entries(extraParams).forEach(([key, value]) => {
        if (key.trim() && value.trim()) {
          merged.push({ key: key.trim(), value: value.trim() });
        }
      });
    }

    return merged;
  }

  private appendParamsWithoutEncoding(baseUrl: string, params: Array<{ key: string; value: string }>): string {
    const [urlWithoutHash, hash] = baseUrl.split('#');
    const separator = urlWithoutHash.includes('?') ? '&' : '?';
    const query = params.map(({ key, value }) => `${key}=${value}`).join('&');
    const rebuilt = `${urlWithoutHash}${separator}${query}`;
    return hash ? `${rebuilt}#${hash}` : rebuilt;
  }

  private hasHeader(headers: Record<string, string>, headerName: string): boolean {
    const target = headerName.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
  }

  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private async sendRequest(): Promise<void> {
    if (!this.currentRequest) return;

    this.isSending = true;
    this.cancelRequested = false;
    this.hasEmittedCancellation = false;
    this.toggleRequestButtons(true);

    // Dispatch event to show loading state in response panel
    const sendingEvent = new CustomEvent('request-sending', {
      detail: { timestamp: Date.now() }
    });
    document.dispatchEvent(sendingEvent);

    try {
      const response = await this.sendRequestWithAuth(this.currentRequest, false);

      if (this.cancelRequested) {
        this.emitCancellationEvent();
        return;
      }

      const event = new CustomEvent('response-received', {
        detail: { response, request: this.currentRequest }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Request failed:', error);
      const message = (error as Error).message || '';

      if (message.toLowerCase().includes('cancel')) {
        this.emitCancellationEvent();
      } else {
        this.onShowError('Request failed: ' + message);

        // Dispatch event to hide loading state
        const failedEvent = new CustomEvent('request-failed', {
          detail: { error: message }
        });
        document.dispatchEvent(failedEvent);
      }
    } finally {
      this.isSending = false;
      this.cancelRequested = false;
      this.toggleRequestButtons(false);
    }
  }

  private async sendRequestWithAuth(request: ApiRequest, isRetry: boolean): Promise<any> {
    let requestToSend = { ...request };

    // Proactive token management for OAuth2
    if (this.editorsManager && requestToSend.auth && requestToSend.auth.type === 'oauth2') {
      requestToSend = await this.ensureValidOAuthToken(requestToSend, isRetry);
    }

    try {
      const response = await window.apiCourier.request.send(requestToSend);
      return response;
    } catch (error) {
      const message = (error as Error).message || '';

      // Check if this is an auth error (401/403) and we have OAuth2 configured
      const isAuthError = message.includes('401') ||
                         message.includes('403') ||
                         message.toLowerCase().includes('unauthorized') ||
                         message.toLowerCase().includes('forbidden') ||
                         message.toLowerCase().includes('token') && message.toLowerCase().includes('expir');

      // Only retry once for auth errors with OAuth2
      if (!isRetry && isAuthError && this.editorsManager && requestToSend.auth && requestToSend.auth.type === 'oauth2') {
        console.log('Auth error detected, attempting token refresh and retry...');

        // Force token refresh/regeneration
        const newRequest = await this.forceTokenRefresh(requestToSend);

        if (newRequest) {
          // Retry the request with the new token
          return await this.sendRequestWithAuth(newRequest, true);
        }
      }

      // Re-throw if not retryable or retry failed
      throw error;
    }
  }

  private async ensureValidOAuthToken(request: ApiRequest, forceFresh: boolean): Promise<ApiRequest> {
    if (!this.editorsManager || !request.auth || request.auth.type !== 'oauth2') {
      return request;
    }

    // Ensure the OAuth2Manager has the current collectionId for variable resolution
    if (request.collectionId) {
      await this.editorsManager.loadAuth(request.auth, request.collectionId);
    }

    let requestToUpdate = { ...request };

    // Case 1: No token exists at all
    if (!requestToUpdate.auth.config.accessToken) {
      const newAuth = await this.editorsManager.autoGetOAuthToken(requestToUpdate.auth);
      if (newAuth) {
        requestToUpdate.auth = { ...newAuth, type: 'oauth2' };
        this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
        this.editorsManager.updateTokenInfo(newAuth.config);
        this.editorsManager.updateOAuthStatus('Token obtained successfully', 'success');
      } else {
        throw new Error('Failed to obtain OAuth token. Please check your configuration.');
      }
      return requestToUpdate;
    }

    // Case 2: Token exists but might be expired (check locally)
    const isExpired = this.editorsManager.isOAuthTokenExpired(requestToUpdate.auth);

    if (isExpired || forceFresh) {
      // Try to refresh first if we have a refresh token
      const refreshedAuth = await this.editorsManager.autoRefreshOAuthToken(requestToUpdate.auth);

      if (refreshedAuth) {
        requestToUpdate.auth = { ...refreshedAuth, type: 'oauth2' };
        this.updateCurrentRequest({ auth: { ...refreshedAuth, type: 'oauth2' } });
        this.editorsManager.updateTokenInfo(refreshedAuth.config);
        this.editorsManager.updateOAuthStatus('Token refreshed successfully', 'success');
      } else {
        // Refresh failed or no refresh token - get a new token
        const newAuth = await this.editorsManager.autoGetOAuthToken(requestToUpdate.auth);
        if (newAuth) {
          requestToUpdate.auth = { ...newAuth, type: 'oauth2' };
          this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
          this.editorsManager.updateTokenInfo(newAuth.config);
          this.editorsManager.updateOAuthStatus('New token obtained successfully', 'success');
        } else {
          throw new Error('Failed to refresh or obtain new OAuth token.');
        }
      }
    }

    return requestToUpdate;
  }

  private async forceTokenRefresh(request: ApiRequest): Promise<ApiRequest | null> {
    if (!this.editorsManager || !request.auth || request.auth.type !== 'oauth2') {
      return null;
    }

    console.log('Forcing token refresh after auth error...');

    // Ensure the OAuth2Manager has the current collectionId for variable resolution
    if (request.collectionId) {
      await this.editorsManager.loadAuth(request.auth, request.collectionId);
    }

    // Try refresh first
    const refreshedAuth = await this.editorsManager.autoRefreshOAuthToken(request.auth);

    if (refreshedAuth) {
      const updatedRequest = {
        ...request,
        auth: { ...refreshedAuth, type: 'oauth2' }
      };
      this.updateCurrentRequest({ auth: { ...refreshedAuth, type: 'oauth2' } });
      this.editorsManager.updateTokenInfo(refreshedAuth.config);
      this.editorsManager.updateOAuthStatus('Token refreshed after auth error', 'success');
      return updatedRequest;
    }

    // If refresh failed, get new token
    const newAuth = await this.editorsManager.autoGetOAuthToken(request.auth);

    if (newAuth) {
      const updatedRequest = {
        ...request,
        auth: { ...newAuth, type: 'oauth2' }
      };
      this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
      this.editorsManager.updateTokenInfo(newAuth.config);
      this.editorsManager.updateOAuthStatus('New token obtained after auth error', 'success');
      return updatedRequest;
    }

    return null;
  }

  private async cancelRequest(): Promise<void> {
    if (!this.currentRequest || !this.isSending || this.cancelRequested) return;

    this.cancelRequested = true;
    this.toggleRequestButtons(true);

    try {
      const cancelled = await window.apiCourier.request.cancel(this.currentRequest.id);
      if (cancelled) {
        this.emitCancellationEvent();
      } else {
        this.cancelRequested = false;
        this.toggleRequestButtons(true);
      }
    } catch (error) {
      console.error('Failed to cancel request:', error);
      this.cancelRequested = false;
      this.toggleRequestButtons(true);
    }
  }

  private toggleRequestButtons(isSending: boolean): void {
    const sendBtn = document.getElementById('send-request') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('cancel-request') as HTMLButtonElement | null;

    if (sendBtn) {
      sendBtn.textContent = isSending ? 'Sending...' : 'Send';
      sendBtn.disabled = isSending;
    }

    if (cancelBtn) {
      cancelBtn.style.display = isSending ? 'inline-flex' : 'none';
      cancelBtn.classList.toggle('visible', isSending);
      cancelBtn.textContent = this.cancelRequested ? 'Cancelling...' : 'Cancel';
      cancelBtn.disabled = this.cancelRequested;
    }
  }

  private emitCancellationEvent(): void {
    if (this.hasEmittedCancellation) return;

    const cancelledEvent = new CustomEvent('request-cancelled', {
      detail: { requestId: this.currentRequest?.id }
    });
    document.dispatchEvent(cancelledEvent);
    this.hasEmittedCancellation = true;
  }
}

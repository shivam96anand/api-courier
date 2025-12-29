import { ApiRequest } from '../../../shared/types';
import { RequestEditorsManager } from './request-editors-manager';
import { UIHelpers } from './UIHelpers';
import { buildCurlCommand } from './curl-builder';
import { resolveRequestVariables } from './request-variable-resolver';
import { OAuthTokenManager } from './oauth-token-manager';

export class RequestDataManager {
  private currentRequest: ApiRequest | null = null;
  private onShowError: (message: string) => void;
  private editorsManager?: RequestEditorsManager;
  private oauthTokenManager?: OAuthTokenManager;
  private isSending = false;
  private cancelRequested = false;
  private hasEmittedCancellation = false;
  private uiHelpers = new UIHelpers();

  constructor(onShowError: (message: string) => void, editorsManager?: RequestEditorsManager) {
    this.onShowError = onShowError;
    this.editorsManager = editorsManager;
    if (editorsManager) {
      this.oauthTokenManager = new OAuthTokenManager(
        editorsManager,
        (updates) => this.updateCurrentRequest(updates)
      );
    }
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

    const resolvedRequest = await resolveRequestVariables(this.currentRequest);
    const curlCommand = buildCurlCommand(resolvedRequest);

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
    if (this.oauthTokenManager && this.oauthTokenManager.canManageToken(requestToSend)) {
      requestToSend = await this.oauthTokenManager.ensureValidToken(requestToSend, isRetry);
    }

    try {
      const response = await window.apiCourier.request.send(requestToSend);
      return response;
    } catch (error) {
      const message = (error as Error).message || '';

      // Only retry once for auth errors with OAuth2
      if (!isRetry && this.oauthTokenManager && 
          this.oauthTokenManager.isAuthError(message) && 
          this.oauthTokenManager.canManageToken(requestToSend)) {
        console.log('Auth error detected, attempting token refresh and retry...');

        // Force token refresh/regeneration
        const newRequest = await this.oauthTokenManager.forceRefresh(requestToSend);

        if (newRequest) {
          // Retry the request with the new token
          return await this.sendRequestWithAuth(newRequest, true);
        }
      }

      // Re-throw if not retryable or retry failed
      throw error;
    }
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

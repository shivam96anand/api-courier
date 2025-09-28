import { ApiRequest } from '../../../shared/types';
import { RequestEditorsManager } from './request-editors-manager';

export class RequestDataManager {
  private currentRequest: ApiRequest | null = null;
  private onShowError: (message: string) => void;
  private editorsManager?: RequestEditorsManager;

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

    this.currentRequest = { ...this.currentRequest, ...updates };

    const event = new CustomEvent('request-updated', {
      detail: { request: this.currentRequest }
    });
    document.dispatchEvent(event);
  }

  private async sendRequest(): Promise<void> {
    if (!this.currentRequest) return;

    const sendBtn = document.getElementById('send-request');
    if (sendBtn) {
      sendBtn.textContent = 'Sending...';
      (sendBtn as HTMLButtonElement).disabled = true;
    }

    try {
      // Check and refresh OAuth token if needed
      let requestToSend = { ...this.currentRequest };

      if (this.editorsManager && requestToSend.auth && requestToSend.auth.type === 'oauth2') {
        // Check if we need to get a new token (no token exists)
        if (!requestToSend.auth.config.accessToken) {
          // Auto-generate token if none exists
          const newAuth = await this.editorsManager.autoGetOAuthToken(requestToSend.auth);
          if (newAuth) {
            requestToSend.auth = { ...newAuth, type: 'oauth2' };
            // Update the current request with new token
            this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
            // Update the UI to show the new token
            this.editorsManager.updateTokenInfo(newAuth.config);
            this.editorsManager.updateOAuthStatus('Token obtained successfully', 'success');
          }
        } else {
          // Check if token is expired first
          const isExpired = this.editorsManager.isOAuthTokenExpired(requestToSend.auth);
          
          if (isExpired) {
            // Try to refresh if token is expired/expiring
            const refreshedAuth = await this.editorsManager.autoRefreshOAuthToken(requestToSend.auth);
            if (refreshedAuth) {
              requestToSend.auth = { ...refreshedAuth, type: 'oauth2' };
              // Update the current request with refreshed token
              this.updateCurrentRequest({ auth: { ...refreshedAuth, type: 'oauth2' } });
              // Update the UI to show the new token and clear expired status
              this.editorsManager.updateTokenInfo(refreshedAuth.config);
              this.editorsManager.updateOAuthStatus('Token refreshed successfully', 'success');
            } else {
              // If refresh failed (no refresh token), get a new token
              const newAuth = await this.editorsManager.autoGetOAuthToken(requestToSend.auth);
              if (newAuth) {
                requestToSend.auth = { ...newAuth, type: 'oauth2' };
                // Update the current request with new token
                this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
                // Update the UI to show the new token and clear expired status
                this.editorsManager.updateTokenInfo(newAuth.config);
                this.editorsManager.updateOAuthStatus('New token obtained successfully', 'success');
              }
            }
          }
        }
      }

      const response = await window.apiCourier.request.send(requestToSend);

      const event = new CustomEvent('response-received', {
        detail: { response, request: requestToSend }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Request failed:', error);
      this.onShowError('Request failed: ' + (error as Error).message);
    } finally {
      if (sendBtn) {
        sendBtn.textContent = 'Send';
        (sendBtn as HTMLButtonElement).disabled = false;
      }
    }
  }
}
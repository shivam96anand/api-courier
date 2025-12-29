import { ApiRequest, AuthConfig } from '../../../shared/types';
import { RequestEditorsManager } from './request-editors-manager';

export type UpdateRequestFn = (updates: Partial<ApiRequest>) => void;

/**
 * Manages OAuth token acquisition, refresh, and validation
 */
export class OAuthTokenManager {
  private editorsManager: RequestEditorsManager;
  private updateCurrentRequest: UpdateRequestFn;

  constructor(editorsManager: RequestEditorsManager, updateCurrentRequest: UpdateRequestFn) {
    this.editorsManager = editorsManager;
    this.updateCurrentRequest = updateCurrentRequest;
  }

  /**
   * Ensures a valid OAuth token exists on the request, refreshing or obtaining as needed
   */
  async ensureValidToken(request: ApiRequest, forceFresh: boolean): Promise<ApiRequest> {
    if (!request.auth || request.auth.type !== 'oauth2') {
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

  /**
   * Forces a token refresh after an authentication error
   */
  async forceRefresh(request: ApiRequest): Promise<ApiRequest | null> {
    if (!request.auth || request.auth.type !== 'oauth2') {
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
        auth: { ...refreshedAuth, type: 'oauth2' } as AuthConfig
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
        auth: { ...newAuth, type: 'oauth2' } as AuthConfig
      };
      this.updateCurrentRequest({ auth: { ...newAuth, type: 'oauth2' } });
      this.editorsManager.updateTokenInfo(newAuth.config);
      this.editorsManager.updateOAuthStatus('New token obtained after auth error', 'success');
      return updatedRequest;
    }

    return null;
  }

  /**
   * Checks if the error indicates an authentication failure
   */
  isAuthError(errorMessage: string): boolean {
    const message = errorMessage.toLowerCase();
    return message.includes('401') ||
           message.includes('403') ||
           message.includes('unauthorized') ||
           message.includes('forbidden') ||
           (message.includes('token') && message.includes('expir'));
  }

  /**
   * Checks if OAuth token management is available for the request
   */
  canManageToken(request: ApiRequest): boolean {
    return !!(request.auth && request.auth.type === 'oauth2');
  }
}

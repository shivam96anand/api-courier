import { VariableResolver } from './VariableResolver';
import { UIHelpers } from './UIHelpers';
import { OAuth2UIRenderer } from './OAuth2UIRenderer';

/**
 * OAuth2Manager - Manages OAuth 2.0 authentication flow
 * Handles OAuth token retrieval, refresh, and management
 */
export class OAuth2Manager {
  private variableResolver: VariableResolver;
  private uiHelpers: UIHelpers;
  private uiRenderer: OAuth2UIRenderer;
  private onConfigUpdate: (config: Record<string, string>) => void;
  private currentCollectionId?: string;

  constructor(
    onConfigUpdate: (config: Record<string, string>) => void,
    variableResolver: VariableResolver,
    uiHelpers: UIHelpers
  ) {
    this.onConfigUpdate = onConfigUpdate;
    this.variableResolver = variableResolver;
    this.uiHelpers = uiHelpers;
    this.uiRenderer = new OAuth2UIRenderer();
  }

  /**
   * Sets the current collection ID for variable resolution
   */
  setCollectionId(collectionId?: string): void {
    this.currentCollectionId = collectionId;
    console.log('[OAuth2Manager] Set collectionId:', collectionId);
  }

  /**
   * Renders the OAuth 2.0 configuration UI
   */
  renderConfig(authConfig: HTMLElement): void {
    this.uiRenderer.renderHTML(authConfig);
    this.uiRenderer.attachEventListeners(authConfig, {
      onGetToken: () => this.handleGetToken(),
      onClearToken: () => this.handleClearToken(),
      onGrantTypeChange: (grantType) => this.uiRenderer.toggleGrantTypeFields(grantType),
      onAdvancedToggle: () => this.uiRenderer.toggleAdvancedOptions(),
      onPasswordToggle: () => this.uiHelpers.togglePasswordVisibility(),
      onCopyToken: () => this.uiHelpers.copyAccessToken()
    });
  }

  /**
   * Handles getting a new OAuth token
   */
  private async handleGetToken(): Promise<void> {
    console.log('[OAuth2Manager] Get Token button clicked');

    const authConfig = document.getElementById('auth-config');
    if (!authConfig) {
      console.error('[OAuth2Manager] Auth config element not found');
      return;
    }

    const config = this.uiRenderer.getConfigFromDOM();
    console.log('[OAuth2Manager] Config from DOM (with variables):', { ...config, clientSecret: config.clientSecret ? '***' : undefined });

    try {
      this.uiHelpers.updateOAuthStatus('Getting token...', 'loading');

      // Resolve variables in the config
      const resolvedConfig = await this.variableResolver.resolveConfig(config, this.currentCollectionId);
      console.log('[OAuth2Manager] Resolved config:', { ...resolvedConfig, clientSecret: resolvedConfig.clientSecret ? '***' : undefined });
      console.log('[OAuth2Manager] Starting OAuth flow...');

      // Call OAuth flow through IPC
      const result = await (window as any).electronAPI.oauth.startFlow(resolvedConfig);
      console.log('[OAuth2Manager] OAuth flow result:', { success: result.success, error: result.error });

      if (result.success) {
        console.log('[OAuth2Manager] Token obtained successfully');
        this.uiHelpers.showClearButton(true);

        const updatedConfig = {
          ...config,
          accessToken: result.data.accessToken,
          ...(result.data.refreshToken && { refreshToken: result.data.refreshToken }),
          expiresAt: new Date(Date.now() + result.data.expiresIn * 1000).toISOString()
        };

        // Update the request with the token
        this.onConfigUpdate(updatedConfig);

        // Update token info display
        this.uiHelpers.updateTokenInfo(updatedConfig);
        this.uiHelpers.updateOAuthStatus('Token obtained successfully', 'success');

        // Hide the OAuth status box after a short delay
        setTimeout(() => {
          const oauthStatus = document.getElementById('oauth-status');
          if (oauthStatus) {
            oauthStatus.style.display = 'none';
          }
        }, 2000);
      } else {
        console.error('[OAuth2Manager] OAuth flow failed:', result.error);
        this.uiHelpers.updateOAuthStatus(`Error: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('[OAuth2Manager] Exception during OAuth flow:', error);
      this.uiHelpers.updateOAuthStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  /**
   * Handles clearing the OAuth token
   */
  private handleClearToken(): void {
    // Get current config and clear token-related fields
    const config = this.uiRenderer.getConfigFromDOM();
    this.onConfigUpdate({
      ...config,
      accessToken: '',
      refreshToken: '',
      expiresAt: ''
    });

    // Hide the clear button and token info
    this.uiHelpers.showClearButton(false);

    // Hide token info panel
    const tokenInfo = document.getElementById('oauth-token-info');
    if (tokenInfo) {
      tokenInfo.style.display = 'none';
    }
  }

  /**
   * Loads OAuth configuration into the UI
   */
  loadConfig(config: Record<string, string>): void {
    this.uiRenderer.loadConfigToDOM(config);

    // Show OAuth status and refresh button if token exists
    if (config.accessToken) {
      const expiresAt = config.expiresAt ? new Date(config.expiresAt) : null;
      if (expiresAt) {
        const now = new Date();
        const minutesLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 60000);
        if (minutesLeft > 0) {
          this.uiHelpers.updateOAuthStatus(`Token valid. Expires in ${minutesLeft} minutes`, 'success');
        } else {
          this.uiHelpers.updateOAuthStatus('Token expired', 'error');
        }
      } else {
        this.uiHelpers.updateOAuthStatus('Token obtained', 'success');
      }
      this.uiHelpers.showClearButton(true);
      // Update token info display
      this.uiHelpers.updateTokenInfo(config);
    }
  }

  /**
   * Checks if OAuth token is expired
   */
  isTokenExpired(auth: { type: string; config: Record<string, string> }): boolean {
    if (auth.type !== 'oauth2' || !auth.config.expiresAt) return false;

    const expiresAt = new Date(auth.config.expiresAt);
    const now = new Date();

    // Consider token expired if it has already expired OR will expire in the next 5 minutes
    return expiresAt <= now || expiresAt <= new Date(now.getTime() + 5 * 60 * 1000);
  }

  /**
   * Auto-refreshes OAuth token if expired and refresh token is available
   */
  async autoRefreshToken(
    auth: { type: string; config: Record<string, string> }
  ): Promise<{ type: string; config: Record<string, string> } | null> {
    if (auth.type !== 'oauth2') return null;

    // Check if we have a refresh token - if not, can't refresh
    if (!auth.config.refreshToken) return null;

    // Only refresh if token is expired or expiring soon
    if (!this.isTokenExpired(auth)) return null;

    try {
      const result = await (window as any).electronAPI.oauth.refreshToken(auth.config);

      if (result.success) {
        return {
          type: 'oauth2',
          config: {
            ...auth.config,
            accessToken: result.data.accessToken,
            expiresAt: new Date(Date.now() + result.data.expiresIn * 1000).toISOString()
          }
        };
      }
    } catch (error) {
      console.error('Auto refresh failed:', error);
    }

    return null;
  }

  /**
   * Auto-gets OAuth token if none exists
   */
  async autoGetToken(
    auth: { type: string; config: Record<string, string> }
  ): Promise<{ type: string; config: Record<string, string> } | null> {
    if (auth.type !== 'oauth2') return null;

    // Check if we have the required configuration to get a token
    if (!auth.config.tokenUrl || !auth.config.clientId) return null;

    try {
      const result = await (window as any).electronAPI.oauth.startFlow(auth.config);

      if (result.success) {
        const updatedConfig = {
          ...auth.config,
          accessToken: result.data.accessToken,
          ...(result.data.refreshToken && { refreshToken: result.data.refreshToken }),
          expiresAt: new Date(Date.now() + result.data.expiresIn * 1000).toISOString()
        };

        // Update the UI as well
        this.uiHelpers.showClearButton(true);
        this.uiHelpers.updateTokenInfo(updatedConfig);

        return {
          type: 'oauth2',
          config: updatedConfig
        };
      }
    } catch (error) {
      console.error('Auto token generation failed:', error);
    }

    return null;
  }
}

import { OAuth2Manager } from './OAuth2Manager';
import { UIHelpers } from './UIHelpers';

/**
 * AuthConfigManager - Manages authentication configuration UI
 * Handles rendering and updates for various auth types (basic, bearer, API key, OAuth2)
 */
export class AuthConfigManager {
  private oauth2Manager: OAuth2Manager;
  private uiHelpers: UIHelpers;
  private onAuthUpdate: (auth: { type: string; config: Record<string, string> }) => void;
  private authConfigInputListener?: (event: Event) => void;
  private isLoading: boolean = false; // Flag to suppress updates during loading

  constructor(
    onAuthUpdate: (auth: { type: string; config: Record<string, string> }) => void,
    oauth2Manager: OAuth2Manager,
    uiHelpers: UIHelpers
  ) {
    this.onAuthUpdate = onAuthUpdate;
    this.oauth2Manager = oauth2Manager;
    this.uiHelpers = uiHelpers;
  }

  /**
   * Initializes the auth editor with event listeners
   */
  setup(): void {
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;

    if (authTypeSelect) {
      authTypeSelect.addEventListener('change', () => {
        const newAuthType = authTypeSelect.value;
        this.renderConfig(newAuthType);
        this.uiHelpers.toggleOAuthStatus(newAuthType === 'oauth2');

        // Update the request with the new auth type and empty config
        this.onAuthUpdate({
          type: newAuthType,
          config: {}
        });
      });
    }
  }

  /**
   * Renders authentication configuration UI based on auth type
   */
  renderConfig(authType: string): void {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    // Always detach old listeners before re-rendering inputs
    if (this.authConfigInputListener) {
      authConfig.removeEventListener('input', this.authConfigInputListener);
      this.authConfigInputListener = undefined;
    }

    authConfig.innerHTML = '';

    const configs: Record<string, string[]> = {
      basic: ['username', 'password'],
      bearer: ['token'],
      'api-key': ['key', 'value', 'location'],
      oauth2: [], // OAuth2 has custom rendering
    };

    if (authType === 'oauth2') {
      // Delegate OAuth2 rendering to OAuth2Manager
      this.oauth2Manager.renderConfig(authConfig);
    } else {
      // Handle other auth types
      const fields = configs[authType] || [];

      fields.forEach(field => {
        if (field === 'location') {
          const select = document.createElement('select');
          select.dataset.field = field;
          select.innerHTML = '<option value="header">Header</option><option value="query">Query</option>';
          authConfig.appendChild(select);
        } else {
          const input = document.createElement('input');
          input.type = field === 'password' ? 'password' : 'text';
          input.placeholder = field.charAt(0).toUpperCase() + field.slice(1);
          input.dataset.field = field;
          authConfig.appendChild(input);
        }
      });

      // Add input listener for non-OAuth types
      this.authConfigInputListener = () => {
        this.updateFromDOM(authType);
      };
      authConfig.addEventListener('input', this.authConfigInputListener);
    }

    // Dispatch event to notify that auth inputs have been rendered
    const event = new CustomEvent('auth-inputs-rendered');
    document.dispatchEvent(event);
  }

  /**
   * Updates auth configuration from DOM inputs
   */
  private updateFromDOM(authType: string): void {
    // Don't update during loading to prevent overwriting saved config
    if (this.isLoading) {
      console.log('[AuthConfigManager] Suppressing update during loading');
      return;
    }

    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    const config: Record<string, string> = {};
    const inputs = authConfig.querySelectorAll('input, select');

    inputs.forEach(input => {
      const field = (input as HTMLElement).dataset.field;
      const value = (input as HTMLInputElement | HTMLSelectElement).value;

      if (field) {
        config[field] = value;
      }
    });

    this.onAuthUpdate({
      type: authType,
      config
    });
  }

  /**
   * Loads authentication configuration into the UI
   */
  load(auth: { type: string; config: Record<string, string> }, collectionId?: string): void {
    // Set loading flag to suppress spurious updates
    this.isLoading = true;
    console.log('[AuthConfigManager] Starting load with isLoading=true');

    // Set collectionId in OAuth2Manager for variable resolution
    this.oauth2Manager.setCollectionId(collectionId);
    console.log('[AuthConfigManager] Loaded auth with collectionId:', collectionId);

    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;

    if (authTypeSelect) {
      authTypeSelect.value = auth.type;
      this.renderConfig(auth.type);
      this.uiHelpers.toggleOAuthStatus(auth.type === 'oauth2');

      if (auth.type === 'oauth2') {
        // Prevent field listeners from overwriting saved tokens during load
        this.oauth2Manager.setLoadingState(true);
        // Delegate OAuth2 loading to OAuth2Manager
        // Use single requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          this.oauth2Manager.loadConfig(auth.config);
          // Clear loading flag after config is loaded
          this.isLoading = false;
          this.oauth2Manager.setLoadingState(false);
          console.log('[AuthConfigManager] OAuth2 load complete, isLoading=false');
        });
      } else {
        // Load non-OAuth2 auth config
        requestAnimationFrame(() => {
          const authConfig = document.getElementById('auth-config');
          if (authConfig) {
            Object.entries(auth.config).forEach(([field, value]) => {
              const input = authConfig.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
              if (input) {
                input.value = value;
                // Trigger input event to refresh variable highlighting
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });

            // Clear loading flag after config is loaded
            this.isLoading = false;
            console.log('[AuthConfigManager] Non-OAuth2 load complete, isLoading=false');
          }
        });
      }
    }
  }

  /**
   * Clears authentication configuration
   */
  clear(): void {
    this.isLoading = false; // Reset flag when clearing
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;
    if (authTypeSelect) {
      authTypeSelect.value = 'none';
      this.renderConfig('none');
    }
  }

  /**
   * Checks if OAuth token is expired
   */
  isOAuthTokenExpired(auth: { type: string; config: Record<string, string> }): boolean {
    return this.oauth2Manager.isTokenExpired(auth);
  }

  /**
   * Auto-refreshes OAuth token if expired
   */
  async autoRefreshOAuthToken(
    auth: { type: string; config: Record<string, string> }
  ): Promise<{ type: string; config: Record<string, string> } | null> {
    return this.oauth2Manager.autoRefreshToken(auth);
  }

  /**
   * Auto-gets OAuth token if none exists
   */
  async autoGetOAuthToken(
    auth: { type: string; config: Record<string, string> }
  ): Promise<{ type: string; config: Record<string, string> } | null> {
    return this.oauth2Manager.autoGetToken(auth);
  }
}

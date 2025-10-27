/**
 * OAuth2UIRenderer - Handles rendering of OAuth 2.0 UI elements
 * Manages HTML generation and event listener attachment for OAuth components
 */
export class OAuth2UIRenderer {
  /**
   * Renders the complete OAuth 2.0 configuration UI
   */
  renderHTML(authConfig: HTMLElement): void {
    authConfig.innerHTML = `
      <div class="oauth-config">
        <div class="oauth-field">
          <label>Grant Type:</label>
          <div class="select-wrapper">
            <select data-field="grantType" class="oauth-grant-type" id="oauth-grant-type">
              <option value="client_credentials">Client Credentials</option>
              <option value="authorization_code">Authorization Code</option>
              <option value="device_code">Device Code</option>
            </select>
          </div>
        </div>

        <!-- Essential Fields -->
        <div class="oauth-essential-fields">
          <div class="oauth-field">
            <label>Token URL <span class="required">*</span>:</label>
            <input type="text" data-field="tokenUrl" placeholder="https://example.com/oauth/token" required>
          </div>
          <div class="oauth-field">
            <label>Client ID <span class="required">*</span>:</label>
            <input type="text" data-field="clientId" placeholder="Client ID" required>
          </div>
          <div class="oauth-field">
            <label>Client Secret <span class="required">*</span>:</label>
            <div class="password-field">
              <input type="password" data-field="clientSecret" placeholder="Client Secret" required id="oauth-client-secret">
              <button type="button" class="eye-button" id="oauth-eye-button" title="Toggle password visibility">👁</button>
            </div>
          </div>
        </div>

        <!-- Authorization Code specific fields -->
        <div class="oauth-auth-code-fields" style="display: none;">
          <div class="oauth-field">
            <label>Authorization URL <span class="required">*</span>:</label>
            <input type="text" data-field="authUrl" placeholder="https://example.com/oauth/authorize">
          </div>
          <div class="oauth-field">
            <label>Redirect URI:</label>
            <input type="text" data-field="redirectUri" placeholder="http://localhost:8080/callback" value="http://localhost:8080/callback">
          </div>
        </div>

        <!-- Advanced Options (Collapsible) -->
        <div class="oauth-advanced-section">
          <div class="oauth-advanced-toggle" id="oauth-advanced-toggle">
            <span class="toggle-icon">▶</span>
            <span>Advanced Options</span>
          </div>
          <div class="oauth-advanced-content" id="oauth-advanced-content" style="display: none;">
            <div class="oauth-field">
              <label>Scope:</label>
              <input type="text" data-field="scope" placeholder="read write (optional)">
            </div>
            <div class="oauth-field">
              <label>Resource:</label>
              <input type="text" data-field="resource" placeholder="https://api.example.com (optional)">
            </div>
            <div class="oauth-field">
              <label>Audience:</label>
              <input type="text" data-field="audience" placeholder="api.example.com (optional)">
            </div>
            <div class="oauth-field">
              <label>Header Prefix:</label>
              <input type="text" data-field="headerPrefix" placeholder="Bearer" value="Bearer">
            </div>
            <div class="oauth-field">
              <label>Send Credentials:</label>
              <select data-field="credentials" class="oauth-credentials-method">
                <option value="headers">As Headers (Recommended)</option>
                <option value="body">In Request Body</option>
              </select>
            </div>
          </div>
        </div>

        <div class="oauth-actions">
          <button type="button" class="oauth-btn oauth-get-token" id="oauth-get-token">Get Token</button>
          <button type="button" class="oauth-btn oauth-clear-token" id="oauth-clear-token" style="display: none;">Clear Token</button>
        </div>

        <!-- Token Information Panel -->
        <div class="oauth-token-info" id="oauth-token-info" style="display: none;">
          <div class="token-info-header">
            <h4>Token Information</h4>
          </div>
          <div class="token-info-content" style="font-size: 13px;">
            <div class="token-field" style="margin-bottom: 8px;">
              <span style="margin-right: 8px;">Access Token:</span>
              <code id="oauth-access-token-display" style="font-size: 12px;">No token</code>
              <button type="button" class="copy-token-btn" id="copy-access-token" title="Copy token" style="display: inline-flex; margin-left: 8px;">📋</button>
            </div>
            <div class="token-field" style="margin-bottom: 8px;">
              <span style="margin-right: 8px;">Expires:</span>
              <span class="token-expiry" id="oauth-token-expiry" style="font-size: 12px;">No expiration</span>
            </div>
            <div class="token-field">
              <span style="margin-right: 8px;">Status:</span>
              <span class="token-status" id="oauth-token-status" style="font-size: 12px;">No token</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Attaches event listeners to OAuth UI elements
   */
  attachEventListeners(
    authConfig: HTMLElement,
    callbacks: {
      onGetToken: () => void;
      onClearToken: () => void;
      onGrantTypeChange: (grantType: string) => void;
      onAdvancedToggle: () => void;
      onPasswordToggle: () => void;
      onCopyToken: () => void;
    }
  ): void {
    const getTokenBtn = authConfig.querySelector('#oauth-get-token') as HTMLButtonElement;
    const clearTokenBtn = authConfig.querySelector('#oauth-clear-token') as HTMLButtonElement;
    const grantTypeSelect = authConfig.querySelector('#oauth-grant-type') as HTMLSelectElement;
    const advancedToggle = authConfig.querySelector('#oauth-advanced-toggle') as HTMLElement;
    const eyeButton = authConfig.querySelector('#oauth-eye-button') as HTMLButtonElement;
    const copyTokenBtn = authConfig.querySelector('#copy-access-token') as HTMLButtonElement;

    if (getTokenBtn) {
      getTokenBtn.addEventListener('click', callbacks.onGetToken);
    }

    if (clearTokenBtn) {
      clearTokenBtn.addEventListener('click', callbacks.onClearToken);
    }

    if (grantTypeSelect) {
      grantTypeSelect.addEventListener('change', () => {
        callbacks.onGrantTypeChange(grantTypeSelect.value);
      });
    }

    if (advancedToggle) {
      advancedToggle.addEventListener('click', callbacks.onAdvancedToggle);
    }

    if (eyeButton) {
      eyeButton.addEventListener('click', callbacks.onPasswordToggle);
    }

    if (copyTokenBtn) {
      copyTokenBtn.addEventListener('click', callbacks.onCopyToken);
    }
  }

  /**
   * Toggles grant type-specific fields visibility
   */
  toggleGrantTypeFields(grantType: string): void {
    const authCodeFields = document.querySelector('.oauth-auth-code-fields') as HTMLElement;

    if (authCodeFields) {
      authCodeFields.style.display = grantType === 'authorization_code' ? 'block' : 'none';
    }
  }

  /**
   * Toggles advanced options visibility
   */
  toggleAdvancedOptions(): void {
    const advancedContent = document.getElementById('oauth-advanced-content');
    const toggleIcon = document.querySelector('.toggle-icon');

    if (advancedContent && toggleIcon) {
      const isVisible = advancedContent.style.display !== 'none';
      advancedContent.style.display = isVisible ? 'none' : 'block';
      toggleIcon.textContent = isVisible ? '▶' : '▼';
    }
  }

  /**
   * Gets OAuth configuration from DOM inputs
   */
  getConfigFromDOM(): Record<string, string> {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return {};

    const config: Record<string, string> = {};
    const inputs = authConfig.querySelectorAll('input, select');

    inputs.forEach(input => {
      const field = (input as HTMLElement).dataset.field;
      const value = (input as HTMLInputElement | HTMLSelectElement).value;

      if (field) {
        config[field] = value;
      }
    });

    return config;
  }

  /**
   * Loads OAuth configuration into the UI
   */
  loadConfigToDOM(config: Record<string, string>): void {
    setTimeout(() => {
      const authConfig = document.getElementById('auth-config');
      if (authConfig) {
        Object.entries(config).forEach(([field, value]) => {
          const input = authConfig.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
          if (input) {
            input.value = value;
          }
        });
      }
    }, 0);
  }
}

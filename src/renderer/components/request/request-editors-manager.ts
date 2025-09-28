import { ApiRequest } from '../../../shared/types';

export class RequestEditorsManager {
  private onRequestUpdate: (updates: Partial<ApiRequest>) => void;

  constructor(onRequestUpdate: (updates: Partial<ApiRequest>) => void) {
    this.onRequestUpdate = onRequestUpdate;
  }

  setupParamsEditor(): void {
    const addParamBtn = document.querySelector('.add-param-btn');
    const paramsEditor = document.getElementById('params-editor');

    if (addParamBtn && paramsEditor) {
      addParamBtn.addEventListener('click', () => {
        this.addParamRow();
      });

      paramsEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateParamsFromDOM();
            // Add a new empty row if no rows left
            if (paramsEditor.children.length === 0) {
              this.addParamRow();
            }
          }
        }
      });

      paramsEditor.addEventListener('input', () => {
        this.updateParamsFromDOM();
      });

      paramsEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateParamsFromDOM();
      });
    }
  }

  setupHeadersEditor(): void {
    const addHeaderBtn = document.querySelector('.add-header-btn');
    const headersEditor = document.getElementById('headers-editor');

    if (addHeaderBtn && headersEditor) {
      addHeaderBtn.addEventListener('click', () => {
        this.addHeaderRow();
      });

      headersEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateHeadersFromDOM();
            // Add a new empty row if no rows left
            if (headersEditor.children.length === 0) {
              this.addHeaderRow();
            }
          }
        }
      });

      headersEditor.addEventListener('input', () => {
        this.updateHeadersFromDOM();
      });

      headersEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateHeadersFromDOM();
      });
    }
  }

  setupBodyEditor(): void {
    const bodyTypeInputs = document.querySelectorAll('input[name="body-type"]');
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;

    bodyTypeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const bodyType = target.value;

        if (bodyEditor) {
          bodyEditor.style.display = bodyType === 'none' ? 'none' : 'block';
        }

        this.onRequestUpdate({
          body: {
            type: bodyType as any,
            content: bodyEditor ? bodyEditor.value : ''
          }
        });
      });
    });

    if (bodyEditor) {
      bodyEditor.addEventListener('input', () => {
        const bodyType = (document.querySelector('input[name="body-type"]:checked') as HTMLInputElement)?.value || 'none';

        this.onRequestUpdate({
          body: {
            type: bodyType as any,
            content: bodyEditor.value
          }
        });
      });
    }
  }

  setupAuthEditor(): void {
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;

    if (authTypeSelect) {
      authTypeSelect.addEventListener('change', () => {
        this.renderAuthConfig(authTypeSelect.value);
        this.toggleOAuthStatus(authTypeSelect.value === 'oauth2');
      });
    }
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

  private renderAuthConfig(authType: string): void {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    authConfig.innerHTML = '';

    const configs: Record<string, string[]> = {
      basic: ['username', 'password'],
      bearer: ['token'],
      'api-key': ['key', 'value', 'location'],
      oauth2: ['clientId', 'clientSecret', 'authUrl', 'tokenUrl', 'scope', 'redirectUri'],
    };

    const fields = configs[authType] || [];

    if (authType === 'oauth2') {
      // Create OAuth 2.0 specific UI
      this.renderOAuth2Config(authConfig);
    } else {
      // Handle other auth types
      fields.forEach(field => {
        const input = document.createElement('input');
        input.type = field === 'password' ? 'password' : 'text';
        input.placeholder = field.charAt(0).toUpperCase() + field.slice(1);
        input.dataset.field = field;

        if (field === 'location') {
          const select = document.createElement('select');
          select.dataset.field = field;
          select.innerHTML = '<option value="header">Header</option><option value="query">Query</option>';
          authConfig.appendChild(select);
        } else {
          authConfig.appendChild(input);
        }
      });
    }

    authConfig.addEventListener('input', () => {
      this.updateAuthFromDOM(authType);
    });
  }

  private updateAuthFromDOM(authType: string): void {
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

    this.onRequestUpdate({
      auth: {
        type: authType as any,
        config
      }
    });
  }

  loadParams(params: Record<string, string>): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor) return;

    paramsEditor.innerHTML = '';

    Object.entries(params).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      paramsEditor.appendChild(row);
    });

    if (paramsEditor.children.length === 0) {
      this.addParamRow();
    }
  }

  loadHeaders(headers: Record<string, string>): void {
    const headersEditor = document.getElementById('headers-editor');
    if (!headersEditor) return;

    headersEditor.innerHTML = '';

    Object.entries(headers).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }
  }

  loadBody(body: { type: string; content: string }): void {
    const bodyTypeInput = document.querySelector(`input[name="body-type"][value="${body.type}"]`) as HTMLInputElement;
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;

    if (bodyTypeInput) {
      bodyTypeInput.checked = true;
    }

    if (bodyEditor) {
      bodyEditor.value = body.content;
      bodyEditor.style.display = body.type === 'none' ? 'none' : 'block';
    }
  }

  loadAuth(auth: { type: string; config: Record<string, string> }): void {
    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;

    if (authTypeSelect) {
      authTypeSelect.value = auth.type;
      this.renderAuthConfig(auth.type);
      this.toggleOAuthStatus(auth.type === 'oauth2');

      setTimeout(() => {
        const authConfig = document.getElementById('auth-config');
        if (authConfig) {
          Object.entries(auth.config).forEach(([field, value]) => {
            const input = authConfig.querySelector(`[data-field="${field}"]`) as HTMLInputElement;
            if (input) {
              input.value = value;
            }
          });

          // Show OAuth status and refresh button if token exists
          if (auth.type === 'oauth2' && auth.config.accessToken) {
            const expiresAt = auth.config.expiresAt ? new Date(auth.config.expiresAt) : null;
            if (expiresAt) {
              const now = new Date();
              const minutesLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 60000);
              if (minutesLeft > 0) {
                this.updateOAuthStatus(`Token valid. Expires in ${minutesLeft} minutes`, 'success');
              } else {
                this.updateOAuthStatus('Token expired', 'error');
              }
            } else {
              this.updateOAuthStatus('Token obtained', 'success');
            }
            this.showClearButton(true);
            // Update token info display
            this.updateTokenInfo(auth.config);
          }
        }
      }, 0);
    }
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
    const bodyEditor = document.getElementById('request-body') as HTMLTextAreaElement;
    if (bodyEditor) bodyEditor.value = '';

    const paramsEditor = document.getElementById('params-editor');
    if (paramsEditor) {
      paramsEditor.innerHTML = '';
      this.addParamRow();
    }

    const headersEditor = document.getElementById('headers-editor');
    if (headersEditor) {
      headersEditor.innerHTML = '';
      this.addHeaderRow();
    }

    const noneBodyType = document.querySelector('input[name="body-type"][value="none"]') as HTMLInputElement;
    if (noneBodyType) {
      noneBodyType.checked = true;
    }

    const authTypeSelect = document.getElementById('auth-type') as HTMLSelectElement;
    if (authTypeSelect) {
      authTypeSelect.value = 'none';
      this.renderAuthConfig('none');
    }
  }

  private renderOAuth2Config(authConfig: HTMLElement): void {
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

    // Add event listeners for OAuth actions
    const getTokenBtn = authConfig.querySelector('#oauth-get-token') as HTMLButtonElement;
    const clearTokenBtn = authConfig.querySelector('#oauth-clear-token') as HTMLButtonElement;
    const grantTypeSelect = authConfig.querySelector('#oauth-grant-type') as HTMLSelectElement;
    const advancedToggle = authConfig.querySelector('#oauth-advanced-toggle') as HTMLElement;

    if (getTokenBtn) {
      getTokenBtn.addEventListener('click', () => {
        this.handleOAuthGetToken();
      });
    }

    if (clearTokenBtn) {
      clearTokenBtn.addEventListener('click', () => {
        this.handleOAuthClearToken();
      });
    }

    // Grant type change handler
    if (grantTypeSelect) {
      grantTypeSelect.addEventListener('change', () => {
        this.toggleGrantTypeFields(grantTypeSelect.value);
      });
    }

    // Advanced options toggle
    if (advancedToggle) {
      advancedToggle.addEventListener('click', () => {
        this.toggleAdvancedOptions();
      });
    }

    // Eye button for password visibility toggle
    const eyeButton = authConfig.querySelector('#oauth-eye-button') as HTMLButtonElement;
    if (eyeButton) {
      eyeButton.addEventListener('click', () => {
        this.togglePasswordVisibility();
      });
    }

    // Copy token button
    const copyTokenBtn = authConfig.querySelector('#copy-access-token') as HTMLButtonElement;
    if (copyTokenBtn) {
      copyTokenBtn.addEventListener('click', () => {
        this.copyAccessToken();
      });
    }
  }

  private toggleOAuthStatus(show: boolean): void {
    const oauthStatus = document.getElementById('oauth-status');
    if (oauthStatus) {
      oauthStatus.style.display = show ? 'block' : 'none';
    }
  }

  private toggleGrantTypeFields(grantType: string): void {
    const authCodeFields = document.querySelector('.oauth-auth-code-fields') as HTMLElement;

    if (authCodeFields) {
      authCodeFields.style.display = grantType === 'authorization_code' ? 'block' : 'none';
    }
  }

  private toggleAdvancedOptions(): void {
    const advancedContent = document.getElementById('oauth-advanced-content');
    const toggleIcon = document.querySelector('.toggle-icon');

    if (advancedContent && toggleIcon) {
      const isVisible = advancedContent.style.display !== 'none';
      advancedContent.style.display = isVisible ? 'none' : 'block';
      toggleIcon.textContent = isVisible ? '▶' : '▼';
    }
  }

  private async handleOAuthGetToken(): Promise<void> {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    const config = this.getOAuthConfigFromDOM();

    try {
      this.updateOAuthStatus('Getting token...', 'loading');

      // Call OAuth flow through IPC
      const result = await (window as any).electronAPI.oauth.startFlow(config);

      if (result.success) {
        this.showClearButton(true);

        const updatedConfig = {
          ...config,
          accessToken: result.data.accessToken,
          ...(result.data.refreshToken && { refreshToken: result.data.refreshToken }),
          expiresAt: new Date(Date.now() + result.data.expiresIn * 1000).toISOString()
        };

        // Update the request with the token
        this.onRequestUpdate({
          auth: {
            type: 'oauth2',
            config: updatedConfig
          }
        });

        // Update token info display
        this.updateTokenInfo(updatedConfig);
        
        // Hide the OAuth status box
        const oauthStatus = document.getElementById('oauth-status');
        if (oauthStatus) {
          oauthStatus.style.display = 'none';
        }
      } else {
        this.updateOAuthStatus(`Error: ${result.error}`, 'error');
      }
    } catch (error) {
      this.updateOAuthStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private handleOAuthClearToken(): void {
    // Clear the token from the request
    this.onRequestUpdate({
      auth: {
        type: 'oauth2',
        config: {
          // Keep the OAuth configuration but remove token-related fields
          ...this.getOAuthConfigFromDOM(),
          accessToken: '',
          refreshToken: '',
          expiresAt: ''
        }
      }
    });

    // Hide the clear button and token info
    this.showClearButton(false);

    // Hide token info panel
    const tokenInfo = document.getElementById('oauth-token-info');
    if (tokenInfo) {
      tokenInfo.style.display = 'none';
    }
  }

  private getOAuthConfigFromDOM(): Record<string, string> {
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

  updateOAuthStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    const oauthStatus = document.getElementById('oauth-status');
    if (!oauthStatus) return;

    // Always hide the OAuth status box - we don't want to show it anymore
    oauthStatus.style.display = 'none';
  }

  private showClearButton(show: boolean): void {
    const clearBtn = document.getElementById('oauth-clear-token');
    if (clearBtn) {
      clearBtn.style.display = show ? 'inline-block' : 'none';
    }
  }

  // Check if OAuth token is expired and needs refresh
  isOAuthTokenExpired(auth: { type: string; config: Record<string, string> }): boolean {
    if (auth.type !== 'oauth2' || !auth.config.expiresAt) return false;

    const expiresAt = new Date(auth.config.expiresAt);
    const now = new Date();

    // Consider token expired if it has already expired OR will expire in the next 5 minutes
    return expiresAt <= now || expiresAt <= new Date(now.getTime() + 5 * 60 * 1000);
  }

  // Auto-refresh OAuth token if expired
  async autoRefreshOAuthToken(auth: { type: string; config: Record<string, string> }): Promise<{ type: string; config: Record<string, string> } | null> {
    if (auth.type !== 'oauth2') return null;

    // Check if we have a refresh token - if not, can't refresh
    if (!auth.config.refreshToken) return null;

    // Only refresh if token is expired or expiring soon
    if (!this.isOAuthTokenExpired(auth)) return null;

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

  // Auto-get OAuth token if none exists
  async autoGetOAuthToken(auth: { type: string; config: Record<string, string> }): Promise<{ type: string; config: Record<string, string> } | null> {
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
        this.showClearButton(true);
        this.updateTokenInfo(updatedConfig);

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

  private togglePasswordVisibility(): void {
    const passwordInput = document.getElementById('oauth-client-secret') as HTMLInputElement;
    const eyeButton = document.getElementById('oauth-eye-button') as HTMLButtonElement;

    if (passwordInput && eyeButton) {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeButton.textContent = isPassword ? '🙈' : '👁';
      eyeButton.title = isPassword ? 'Hide password' : 'Show password';
    }
  }

  private async copyAccessToken(): Promise<void> {
    const tokenDisplay = document.getElementById('oauth-access-token-display') as HTMLElement;
    if (!tokenDisplay || tokenDisplay.textContent === 'No token') {
      this.showToast('No token to copy');
      return;
    }

    // Get the full token from data attribute
    const fullToken = tokenDisplay.getAttribute('data-full-token');
    if (!fullToken) {
      this.showToast('No token to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(fullToken);
      this.showToast('Token copied to clipboard');
    } catch (error) {
      console.error('Failed to copy token:', error);
      this.showToast('Failed to copy token');
    }
  }

  updateTokenInfo(config: Record<string, string>): void {
    const tokenInfo = document.getElementById('oauth-token-info');
    const tokenDisplay = document.getElementById('oauth-access-token-display');
    const tokenExpiry = document.getElementById('oauth-token-expiry');
    const tokenStatus = document.getElementById('oauth-token-status');

    if (!tokenInfo || !tokenDisplay || !tokenExpiry || !tokenStatus) return;

    if (config.accessToken) {
      // Show token panel
      tokenInfo.style.display = 'block';

      // Display truncated token but store full token in data attribute
      const token = config.accessToken;
      const truncatedToken = token.length > 20 ? `${token.substring(0, 20)}...` : token;
      tokenDisplay.textContent = truncatedToken;
      tokenDisplay.setAttribute('data-full-token', token);

      // Display expiration
      if (config.expiresAt) {
        const expiresAt = new Date(config.expiresAt);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        if (timeUntilExpiry > 0) {
          tokenExpiry.textContent = expiresAt.toLocaleString();
          tokenStatus.textContent = 'Valid';
          tokenStatus.className = 'token-status valid';
          tokenInfo.className = 'oauth-token-info valid';
          // Green border for valid tokens
          tokenInfo.style.borderColor = '#10b981';
          tokenInfo.style.backgroundColor = '';
        } else {
          tokenExpiry.textContent = expiresAt.toLocaleString();
          tokenStatus.textContent = 'Expired';
          tokenStatus.className = 'token-status expired';
          tokenInfo.className = 'oauth-token-info expired';
          // Red border only for expired tokens
          tokenInfo.style.borderColor = '#ef4444';
          tokenInfo.style.backgroundColor = '';
        }
      } else {
        tokenExpiry.textContent = 'No expiration';
        tokenStatus.textContent = 'Valid';
        tokenStatus.className = 'token-status valid';
        tokenInfo.className = 'oauth-token-info valid';
        // Green border for valid tokens
        tokenInfo.style.borderColor = '#10b981';
        tokenInfo.style.backgroundColor = '';
      }
    } else {
      // Hide token panel
      tokenInfo.style.display = 'none';
    }
  }

  private showToast(message: string): void {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: var(--primary-color);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      font-size: 12px;
      animation: slideInFromTop 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 2000);
  }
}
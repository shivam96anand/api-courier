/**
 * UIHelpers - Utility functions for UI interactions
 * Handles toast notifications, password visibility toggles, token copying, and token info display
 */
export class UIHelpers {
  /**
   * Shows a toast notification message
   * @param message - Message to display in the toast
   */
  showToast(message: string): void {
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

  /**
   * Toggles password visibility for OAuth client secret field
   */
  togglePasswordVisibility(): void {
    const passwordInput = document.getElementById('oauth-client-secret') as HTMLInputElement;
    const eyeButton = document.getElementById('oauth-eye-button') as HTMLButtonElement;

    if (passwordInput && eyeButton) {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeButton.textContent = isPassword ? '🙈' : '👁';
      eyeButton.title = isPassword ? 'Hide password' : 'Show password';
    }
  }

  /**
   * Copies the OAuth access token to clipboard
   */
  async copyAccessToken(): Promise<void> {
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

  /**
   * Updates the token information display panel
   * @param config - OAuth configuration containing token information
   */
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
          tokenInfo.style.borderColor = '#10b981';
          tokenInfo.style.backgroundColor = '';
        } else {
          tokenExpiry.textContent = expiresAt.toLocaleString();
          tokenStatus.textContent = 'Expired';
          tokenStatus.className = 'token-status expired';
          tokenInfo.className = 'oauth-token-info expired';
          tokenInfo.style.borderColor = '#ef4444';
          tokenInfo.style.backgroundColor = '';
        }
      } else {
        tokenExpiry.textContent = 'No expiration';
        tokenStatus.textContent = 'Valid';
        tokenStatus.className = 'token-status valid';
        tokenInfo.className = 'oauth-token-info valid';
        tokenInfo.style.borderColor = '#10b981';
        tokenInfo.style.backgroundColor = '';
      }
    } else {
      // Hide token panel
      tokenInfo.style.display = 'none';
    }
  }

  /**
   * Updates OAuth status message and styling
   * @param message - Status message to display
   * @param type - Type of status (loading, success, error)
   */
  updateOAuthStatus(message: string, type: 'loading' | 'success' | 'error'): void {
    console.log(`[OAuth] Status update: ${type} - ${message}`);

    const oauthStatus = document.getElementById('oauth-status');
    if (!oauthStatus) {
      console.warn('[OAuth] OAuth status element not found');
      return;
    }

    const statusText = oauthStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = message;
    }

    // Remove all status classes
    oauthStatus.classList.remove('status-loading', 'status-success', 'status-error');

    // Add the appropriate status class
    oauthStatus.classList.add(`status-${type}`);

    // Show the status box
    oauthStatus.style.display = 'block';

    // For errors, keep it visible
    if (type === 'error') {
      console.error('[OAuth] Error displayed to user:', message);
    }
  }

  /**
   * Shows or hides the OAuth clear token button
   * @param show - Whether to show the button
   */
  showClearButton(show: boolean): void {
    const clearBtn = document.getElementById('oauth-clear-token');
    if (clearBtn) {
      clearBtn.style.display = show ? 'inline-block' : 'none';
    }
  }

  /**
   * Shows or hides the OAuth status panel
   * @param show - Whether to show the status panel
   */
  toggleOAuthStatus(show: boolean): void {
    const oauthStatus = document.getElementById('oauth-status');
    if (oauthStatus) {
      oauthStatus.style.display = show ? 'block' : 'none';
    }
  }
}

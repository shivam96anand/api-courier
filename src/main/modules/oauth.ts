import { BrowserWindow, net } from 'electron';
import { randomBytes } from 'crypto';
import {
  OAuthConfig,
  OAuthResult,
  OAuthTokenResponse,
} from '../../shared/types';

export class OAuthManager {
  private authWindows: Map<string, BrowserWindow> = new Map();
  private pendingRequests: Map<
    string,
    { resolve: (result: OAuthResult) => void; reject: (error: Error) => void }
  > = new Map();

  async startFlow(config: OAuthConfig): Promise<OAuthResult> {
    try {
      switch (config.grantType) {
        case 'authorization_code':
          return this.handleAuthorizationCodeFlow(config);
        case 'client_credentials':
          return this.handleClientCredentialsFlow(config);
        case 'device_code':
          return this.handleDeviceCodeFlow(config);
        default:
          return {
            success: false,
            error: `Unsupported grant type: ${config.grantType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async refreshToken(config: OAuthConfig): Promise<OAuthResult> {
    if (!config.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const tokenResponse = await this.exchangeRefreshToken(config);
      return { success: true, data: tokenResponse };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
    }
  }

  getTokenInfo(config: OAuthConfig): { isValid: boolean; expiresIn?: number } {
    if (!config.accessToken || !config.expiresAt) {
      return { isValid: false };
    }

    const expiresAt = new Date(config.expiresAt);
    const now = new Date();
    const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

    return {
      isValid: expiresIn > 0,
      expiresIn: expiresIn > 0 ? expiresIn : 0,
    };
  }

  private async handleAuthorizationCodeFlow(
    config: OAuthConfig
  ): Promise<OAuthResult> {
    return new Promise((resolve, reject) => {
      const state = randomBytes(32).toString('base64url');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = this.generateCodeChallenge(codeVerifier);

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scope || '',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authUrl = `${config.authUrl}?${authParams.toString()}`;

      // Create auth window
      const authWindow = new BrowserWindow({
        width: 500,
        height: 600,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const requestId = randomBytes(16).toString('hex');
      this.authWindows.set(requestId, authWindow);
      this.pendingRequests.set(requestId, { resolve, reject });

      authWindow.loadURL(authUrl);

      // Listen for navigation to handle callback
      authWindow.webContents.on(
        'will-navigate',
        async (event, navigationUrl) => {
          if (navigationUrl.startsWith(config.redirectUri)) {
            event.preventDefault();

            try {
              const urlObj = new URL(navigationUrl);
              const code = urlObj.searchParams.get('code');
              const returnedState = urlObj.searchParams.get('state');
              const error = urlObj.searchParams.get('error');

              if (error) {
                throw new Error(`OAuth error: ${error}`);
              }

              if (returnedState !== state) {
                throw new Error('Invalid state parameter');
              }

              if (!code) {
                throw new Error('No authorization code received');
              }

              // Exchange code for token
              const tokenResponse = await this.exchangeCodeForToken(
                config,
                code,
                codeVerifier
              );
              resolve({ success: true, data: tokenResponse });
            } catch (err) {
              reject(err);
            } finally {
              this.cleanup(requestId);
            }
          }
        }
      );

      authWindow.on('closed', () => {
        this.cleanup(requestId);
        reject(new Error('Authentication window was closed'));
      });
    });
  }

  private async handleClientCredentialsFlow(
    config: OAuthConfig
  ): Promise<OAuthResult> {
    try {
      console.log('[OAuth] Client Credentials Flow:', {
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        hasTokenUrl: !!config.tokenUrl,
      });
      const response = await this.makeTokenRequest(config.tokenUrl, config);
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Client credentials flow failed',
      };
    }
  }

  private async handleDeviceCodeFlow(
    config: OAuthConfig
  ): Promise<OAuthResult> {
    try {
      // Step 1: Request device code
      const deviceCodeParams = new URLSearchParams({
        client_id: config.clientId,
        scope: config.scope || '',
      });

      const deviceCodeUrl = config.authUrl.replace('/authorize', '/device');
      const deviceResponse = await net.fetch(deviceCodeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: deviceCodeParams,
      });

      if (!deviceResponse.ok) {
        throw new Error(
          `Device code request failed: ${deviceResponse.statusText}`
        );
      }

      const deviceData = (await deviceResponse.json()) as any;
      const {
        device_code,
        user_code,
        verification_uri,
        interval = 5,
      } = deviceData;

      // Step 2: Show user code and verification URL
      const userCodeWindow = new BrowserWindow({
        width: 400,
        height: 300,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const userCodeHtml = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
            <h2>Device Authorization</h2>
            <p>To complete authentication, visit:</p>
            <p><strong>${verification_uri}</strong></p>
            <p>And enter this code:</p>
            <h1 style="font-size: 2em; color: #0066cc;">${user_code}</h1>
            <p><small>This window will close automatically when authentication is complete.</small></p>
          </body>
        </html>
      `;

      userCodeWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(userCodeHtml)}`
      );

      // Step 3: Poll for token
      return new Promise((resolve, reject) => {
        let pollCount = 0;
        const maxPolls = 60; // Max ~5 minutes with default 5s interval

        const pollForToken = async () => {
          pollCount++;

          if (pollCount > maxPolls) {
            userCodeWindow.close();
            reject(
              new Error('Device authorization timed out. Please try again.')
            );
            return;
          }

          try {
            const tokenParams = new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              client_id: config.clientId,
              device_code,
            });

            const tokenResponse = await this.makeTokenRequest(
              config.tokenUrl,
              tokenParams
            );
            userCodeWindow.close();
            resolve({ success: true, data: tokenResponse });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('authorization_pending')) {
              // Continue polling
              setTimeout(pollForToken, interval * 1000);
            } else {
              userCodeWindow.close();
              reject(error);
            }
          }
        };

        setTimeout(pollForToken, interval * 1000);

        userCodeWindow.on('closed', () => {
          reject(new Error('Device authorization window was closed'));
        });
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Device code flow failed',
      };
    }
  }

  private async exchangeCodeForToken(
    config: OAuthConfig,
    code: string,
    codeVerifier: string
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret || '',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    });

    return this.makeTokenRequest(config.tokenUrl, params);
  }

  private async exchangeRefreshToken(
    config: OAuthConfig
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret || '',
      refresh_token: config.refreshToken!,
    });

    return this.makeTokenRequest(config.tokenUrl, params);
  }

  private async makeTokenRequest(
    tokenUrl: string,
    configOrParams: OAuthConfig | URLSearchParams
  ): Promise<OAuthTokenResponse> {
    let requestBody: string;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (configOrParams instanceof URLSearchParams) {
      // Legacy support for existing flows
      requestBody = configOrParams.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      // New config-based approach
      const config = configOrParams;
      const credentials = (config as any).credentials || 'headers';

      // Build parameters conditionally
      const params = new URLSearchParams();

      // Always include grant_type and client_id
      params.append(
        'grant_type',
        config.grantType === 'authorization_code'
          ? 'authorization_code'
          : 'client_credentials'
      );
      params.append('client_id', config.clientId);

      // Add optional fields
      if (config.scope && config.scope.trim()) {
        params.append('scope', config.scope.trim());
      }

      if ((config as any).resource && (config as any).resource.trim()) {
        params.append('resource', (config as any).resource.trim());
      }

      if ((config as any).audience && (config as any).audience.trim()) {
        params.append('audience', (config as any).audience.trim());
      }

      if (credentials === 'body') {
        // Send client_secret in request body
        if (config.clientSecret && config.clientSecret.trim()) {
          params.append('client_secret', config.clientSecret);
        }
      } else {
        // Send credentials in Authorization header
        if (config.clientSecret && config.clientSecret.trim()) {
          const auth = Buffer.from(
            `${config.clientId}:${config.clientSecret}`,
            'utf-8'
          ).toString('base64');
          headers['Authorization'] = `Basic ${auth}`;
        }
      }

      requestBody = params.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    // Debug logging (redact secrets)
    console.log('[OAuth] Token request:', {
      url: tokenUrl,
      hasAuthHeader: !!headers['Authorization'],
      credentialsMode:
        (configOrParams as any).credentials || 'headers (default)',
    });

    const response = await net.fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as any;

    if (data.error) {
      throw new Error(
        `OAuth error: ${data.error} - ${data.error_description || ''}`
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    };
  }

  private generateCodeChallenge(codeVerifier: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private cleanup(requestId: string): void {
    const window = this.authWindows.get(requestId);
    if (window && !window.isDestroyed()) {
      window.close();
    }
    this.authWindows.delete(requestId);
    this.pendingRequests.delete(requestId);
  }
}

export const oauthManager = new OAuthManager();

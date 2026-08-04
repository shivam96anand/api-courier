import { BrowserWindow, net } from 'electron';
import { randomBytes } from 'crypto';
import {
  OAuthConfig,
  OAuthResult,
  OAuthTokenResponse,
} from '../../shared/types';

/**
 * Encode a value with the `application/x-www-form-urlencoded` algorithm so it
 * can be embedded safely in an HTTP Basic `Authorization` header.
 *
 * RFC 6749 §2.3.1 requires `client_id` and `client_secret` to be
 * form-urlencoded *before* they are colon-joined and Base64-encoded.
 * Spec-compliant servers (e.g. the Spring Authorization Server) URL-decode the
 * credentials again, so this is a no-op for plain alphanumeric secrets but is
 * essential when a secret contains reserved characters such as `+`, `/`, `=`
 * or a space. Skipping it yields credentials the server cannot match, which
 * surfaces as `invalid_client` / "Bad client credentials".
 */
function formUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export class OAuthManager {
  private authWindows: Map<string, BrowserWindow> = new Map();
  private pendingRequests: Map<
    string,
    { resolve: (result: OAuthResult) => void; reject: (error: Error) => void }
  > = new Map();

  // AbortControllers for every in-flight token HTTP exchange. Populated by
  // makeTokenRequest() so cancelAll() can interrupt a slow token endpoint —
  // that's the primary reason the user-facing Cancel button appeared to do
  // nothing: the HTTP request owning the click was the OAuth token fetch,
  // not the actual API request (which hadn't started yet).
  private tokenAbortControllers: Set<AbortController> = new Set();
  // Cancel hooks for device-code pollers (setTimeout handles + window refs).
  private deviceFlowCancels: Set<() => void> = new Set();

  cancelAll(): { cancelled: boolean } {
    const hadWork =
      this.tokenAbortControllers.size > 0 ||
      this.deviceFlowCancels.size > 0 ||
      this.pendingRequests.size > 0 ||
      this.authWindows.size > 0;

    // Abort in-flight token fetches
    for (const ctrl of this.tokenAbortControllers) {
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
    }
    this.tokenAbortControllers.clear();

    // Stop device-code pollers
    for (const cancel of this.deviceFlowCancels) {
      try {
        cancel();
      } catch {
        /* ignore */
      }
    }
    this.deviceFlowCancels.clear();

    // Close any auth browser windows and reject their pending promises
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('OAuth flow cancelled by user'));
      this.pendingRequests.delete(id);
    }
    for (const [id, win] of this.authWindows) {
      if (win && !win.isDestroyed()) {
        win.close();
      }
      this.authWindows.delete(id);
    }

    return { cancelled: hadWork };
  }

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
        let pollTimer: NodeJS.Timeout | null = null;
        let cancelled = false;

        const cancelHook = (): void => {
          cancelled = true;
          if (pollTimer) clearTimeout(pollTimer);
          if (!userCodeWindow.isDestroyed()) userCodeWindow.close();
          reject(new Error('Device authorization cancelled by user'));
        };
        this.deviceFlowCancels.add(cancelHook);

        const pollForToken = async () => {
          if (cancelled) return;
          pollCount++;

          if (pollCount > maxPolls) {
            this.deviceFlowCancels.delete(cancelHook);
            if (!userCodeWindow.isDestroyed()) userCodeWindow.close();
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
            if (cancelled) return;
            this.deviceFlowCancels.delete(cancelHook);
            if (!userCodeWindow.isDestroyed()) userCodeWindow.close();
            resolve({ success: true, data: tokenResponse });
          } catch (error) {
            if (cancelled) return;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('authorization_pending')) {
              // Continue polling
              pollTimer = setTimeout(pollForToken, interval * 1000);
            } else {
              this.deviceFlowCancels.delete(cancelHook);
              if (!userCodeWindow.isDestroyed()) userCodeWindow.close();
              reject(error);
            }
          }
        };

        pollTimer = setTimeout(pollForToken, interval * 1000);

        userCodeWindow.on('closed', () => {
          if (cancelled) return;
          this.deviceFlowCancels.delete(cancelHook);
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
      // New config-based approach — currently only exercised by the
      // client_credentials flow.
      const config = configOrParams;
      const credentials = (config as any).credentials || 'headers';

      // Build parameters conditionally
      const params = new URLSearchParams();

      // Always include grant_type
      params.append(
        'grant_type',
        config.grantType === 'authorization_code'
          ? 'authorization_code'
          : 'client_credentials'
      );

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

      // Trim credentials: a pasted trailing space/newline otherwise changes the
      // Base64 output and makes the server reject the client.
      const clientId = (config.clientId || '').trim();
      const clientSecret = (config.clientSecret || '').trim();

      if (credentials === 'body') {
        // client_secret_post: identify + authenticate the client entirely in
        // the request body, with no Authorization header.
        params.append('client_id', clientId);
        if (clientSecret) {
          params.append('client_secret', clientSecret);
        }
      } else if (clientSecret) {
        // client_secret_basic: authenticate ONLY via the HTTP Basic header.
        // Per RFC 6749 §2.3.1 the client MUST NOT use more than one
        // authentication method, so client_id is intentionally left out of the
        // body — sending it alongside Basic auth makes strict servers (e.g.
        // Spring) attempt a second, secret-less client authentication and
        // reject with invalid_client / "Bad client credentials". This mirrors
        // Postman/Insomnia/curl.
        const auth = Buffer.from(
          `${formUrlEncode(clientId)}:${formUrlEncode(clientSecret)}`,
          'utf-8'
        ).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      } else {
        // Public client (no secret) in header mode: nothing to put in a Basic
        // header, so identify the client via the body instead.
        params.append('client_id', clientId);
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

    const abortController = new AbortController();
    this.tokenAbortControllers.add(abortController);

    let response: Response;
    try {
      response = await net.fetch(tokenUrl, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: abortController.signal,
      });
    } catch (err) {
      this.tokenAbortControllers.delete(abortController);
      const name = (err as Error)?.name || '';
      if (
        name === 'AbortError' ||
        abortController.signal.aborted ||
        /abort/i.test((err as Error)?.message || '')
      ) {
        throw new Error('OAuth token request cancelled by user');
      }
      throw err;
    }
    this.tokenAbortControllers.delete(abortController);

    if (!response.ok) {
      // Cap the body: error pages (HTML, stack traces) can be huge and the
      // renderer only ever shows a short summary of it.
      const errorText = (await response.text()).slice(0, 2000);
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

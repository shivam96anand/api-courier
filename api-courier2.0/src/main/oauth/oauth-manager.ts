import { shell } from 'electron';
import { randomBytes, createHash } from 'crypto';
import { 
  OAuth2Config, 
  OAuth2TokenResponse, 
  OAuth2TokenInfo, 
  OIDCDiscoveryResponse, 
  DeviceCodeResponse,
  TokenIntrospectionResponse 
} from '../../shared/types';

export class OAuthManager {
  private readonly userAgent = 'API-Courier/1.0.0';
  private keychain: any = null;
  
  constructor() {
    // Try to load keychain if available
    try {
      this.keychain = require('keytar');
    } catch (error) {
      console.warn('Keychain not available, secrets will not be stored securely');
    }
  }

  /**
   * Discover OIDC endpoints from issuer
   */
  async discover(issuer: string): Promise<OIDCDiscoveryResponse> {
    const discoveryUrl = issuer.endsWith('/.well-known/openid-configuration') 
      ? issuer 
      : `${issuer}/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
    }

    const discovery = await response.json() as OIDCDiscoveryResponse;
    return discovery;
  }

  /**
   * Get access token using configured grant type
   */
  async getToken(config: OAuth2Config): Promise<OAuth2TokenInfo> {
    switch (config.grantType) {
      case 'client_credentials':
        return this.getClientCredentialsToken(config);
      case 'authorization_code':
        return this.getAuthorizationCodeToken(config);
      case 'device_code':
        return this.getDeviceCodeToken(config);
      case 'refresh_token':
        throw new Error('Use refreshToken() method for refresh token flow');
      default:
        throw new Error(`Unsupported grant type: ${config.grantType}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(config: OAuth2Config, refreshToken: string): Promise<OAuth2TokenInfo> {
    const tokenUrl = config.tokenUrl;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    if (config.clientId) {
      body.append('client_id', config.clientId);
    }

    if (config.clientSecret) {
      body.append('client_secret', config.clientSecret);
    }

    if (config.scope) {
      body.append('scope', config.scope);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenResponse = await response.json() as OAuth2TokenResponse;
    return this.processTokenResponse(tokenResponse);
  }

  /**
   * Introspect token to check validity
   */
  async introspectToken(config: OAuth2Config, token: string): Promise<TokenIntrospectionResponse> {
    // Try discovery first if available
    let introspectionEndpoint = config.discoveryUrl ? 
      (await this.discover(config.discoveryUrl)).introspection_endpoint : 
      null;

    if (!introspectionEndpoint) {
      // Fallback to common introspection endpoint pattern
      const baseUrl = config.tokenUrl.replace(/\/token$/, '');
      introspectionEndpoint = `${baseUrl}/introspect`;
    }

    if (!introspectionEndpoint) {
      throw new Error('Introspection endpoint not available');
    }

    const body = new URLSearchParams({
      token: token
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': this.userAgent,
      'Accept': 'application/json'
    };

    // Add client authentication
    if (config.clientId && config.clientSecret) {
      const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (config.clientId) {
      body.append('client_id', config.clientId);
    }

    const response = await fetch(introspectionEndpoint, {
      method: 'POST',
      headers,
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token introspection failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json() as TokenIntrospectionResponse;
  }

  /**
   * Client Credentials Grant
   */
  private async getClientCredentialsToken(config: OAuth2Config): Promise<OAuth2TokenInfo> {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Client ID and Secret required for client credentials flow');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret
    });

    if (config.scope) {
      body.append('scope', config.scope);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenResponse = await response.json() as OAuth2TokenResponse;
    return this.processTokenResponse(tokenResponse);
  }

  /**
   * Authorization Code Grant with PKCE
   */
  private async getAuthorizationCodeToken(config: OAuth2Config): Promise<OAuth2TokenInfo> {
    if (!config.authorizationUrl || !config.redirectUri) {
      throw new Error('Authorization URL and Redirect URI required for authorization code flow');
    }

    let codeVerifier = '';
    let codeChallenge = '';

    // Generate PKCE parameters if enabled
    if (config.usePKCE) {
      codeVerifier = this.generateCodeVerifier();
      codeChallenge = this.generateCodeChallenge(codeVerifier);
    }

    const state = this.generateState();
    
    // Build authorization URL
    const authUrl = new URL(config.authorizationUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);

    if (config.scope) {
      authUrl.searchParams.set('scope', config.scope);
    }

    if (config.usePKCE) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    // Open browser for user authorization
    await shell.openExternal(authUrl.toString());

    // In a real implementation, you'd need to:
    // 1. Start a local server to receive the callback
    // 2. Parse the authorization code from the callback
    // 3. Exchange the code for tokens
    
    throw new Error('Authorization code flow requires callback server implementation');
  }

  /**
   * Device Code Grant
   */
  private async getDeviceCodeToken(config: OAuth2Config): Promise<OAuth2TokenInfo> {
    // First, get device code
    const deviceAuth = await this.initiateDeviceCode(config);
    
    // Open verification URL
    await shell.openExternal(deviceAuth.verification_uri_complete || deviceAuth.verification_uri);

    // Poll for token
    return this.pollForDeviceToken(config, deviceAuth);
  }

  private async initiateDeviceCode(config: OAuth2Config): Promise<DeviceCodeResponse> {
    // Try discovery first if available
    let deviceAuthEndpoint = config.discoveryUrl ? 
      (await this.discover(config.discoveryUrl)).device_authorization_endpoint : 
      null;

    if (!deviceAuthEndpoint) {
      // Fallback to common device authorization endpoint pattern
      const baseUrl = config.tokenUrl.replace(/\/token$/, '');
      deviceAuthEndpoint = `${baseUrl}/device/code`;
    }

    if (!deviceAuthEndpoint) {
      throw new Error('Device authorization endpoint not available');
    }

    const body = new URLSearchParams({
      client_id: config.clientId
    });

    if (config.scope) {
      body.append('scope', config.scope);
    }

    const response = await fetch(deviceAuthEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Device code request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json() as DeviceCodeResponse;
  }

  private async pollForDeviceToken(config: OAuth2Config, deviceAuth: DeviceCodeResponse): Promise<OAuth2TokenInfo> {
    const pollInterval = (deviceAuth.interval || 5) * 1000;
    const expiresAt = Date.now() + (deviceAuth.expires_in * 1000);

    while (Date.now() < expiresAt) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const body = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: config.clientId,
          device_code: deviceAuth.device_code
        });

        const response = await fetch(config.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': this.userAgent,
            'Accept': 'application/json'
          },
          body: body.toString()
        });

        if (response.ok) {
          const tokenResponse = await response.json() as OAuth2TokenResponse;
          return this.processTokenResponse(tokenResponse);
        }

        const errorResponse = await response.json() as any;
        
        // Continue polling for these expected errors
        if (errorResponse.error === 'authorization_pending' || 
            errorResponse.error === 'slow_down') {
          continue;
        }

        // Stop polling for other errors
        throw new Error(`Token request failed: ${errorResponse.error} - ${errorResponse.error_description}`);

      } catch (error) {
        console.warn('Error polling for device token:', error);
        continue;
      }
    }

    throw new Error('Device code flow timed out');
  }

  private processTokenResponse(response: OAuth2TokenResponse): OAuth2TokenInfo {
    const expiresAt = response.expires_in ? 
      Date.now() + (response.expires_in * 1000) : 
      undefined;

    return {
      access_token: response.access_token,
      token_type: response.token_type,
      expires_at: expiresAt,
      refresh_token: response.refresh_token,
      scope: response.scope,
      id_token: response.id_token
    };
  }

  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  private generateState(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Store token securely in keychain if available
   */
  async storeToken(config: OAuth2Config, tokenInfo: OAuth2TokenInfo): Promise<void> {
    if (!config.useKeychain || !this.keychain) {
      return;
    }

    const service = `api-courier-oauth2-${config.clientId}`;
    const account = 'access_token';

    try {
      await this.keychain.setPassword(service, account, JSON.stringify(tokenInfo));
    } catch (error) {
      console.warn('Failed to store token in keychain:', error);
    }
  }

  /**
   * Retrieve token from keychain if available
   */
  async retrieveToken(config: OAuth2Config): Promise<OAuth2TokenInfo | null> {
    if (!config.useKeychain || !this.keychain) {
      return null;
    }

    const service = `api-courier-oauth2-${config.clientId}`;
    const account = 'access_token';

    try {
      const tokenJson = await this.keychain.getPassword(service, account);
      if (tokenJson) {
        return JSON.parse(tokenJson);
      }
    } catch (error) {
      console.warn('Failed to retrieve token from keychain:', error);
    }

    return null;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(tokenInfo: OAuth2TokenInfo): boolean {
    if (!tokenInfo.expires_at) {
      return false; // No expiry info, assume valid
    }

    // Add 30 second buffer for network latency
    return Date.now() >= (tokenInfo.expires_at - 30000);
  }
}

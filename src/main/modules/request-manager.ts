import { ApiRequest, ApiResponse } from '../../shared/types';
import { oauthManager } from './oauth';
import { composeFinalRequest, buildFolderVars } from './variables';
import { storeManager } from './store-manager';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';

class RequestManager {
  async sendRequest(request: ApiRequest): Promise<ApiResponse> {
    const startTime = Date.now();

    // Resolve variables first
    const state = storeManager.getState();
    const activeEnv = state.activeEnvironmentId
      ? state.environments.find(e => e.id === state.activeEnvironmentId)
      : undefined;

    // Build folder variables from ancestor chain
    const folderVars = buildFolderVars(request.collectionId, state.collections);

    const resolvedRequest = composeFinalRequest(request, activeEnv, state.globals, folderVars);

    // Create a request object with resolved values
    const requestWithResolved: ApiRequest = {
      ...request,
      url: resolvedRequest.url,
      params: resolvedRequest.params,
      headers: resolvedRequest.headers,
      body: resolvedRequest.body as any,
      auth: resolvedRequest.auth,
    };

    // Handle OAuth token refresh if needed
    const updatedRequest = await this.handleOAuthRefresh(requestWithResolved);

    return new Promise<ApiResponse>((resolve) => {
      try {
        // Build URL with query parameters
        let urlString = updatedRequest.url;
        if (updatedRequest.params && Object.keys(updatedRequest.params).length > 0) {
          const urlObj = new URL(urlString);
          Object.entries(updatedRequest.params).forEach(([key, value]) => {
            if (key.trim() && value.trim()) {
              urlObj.searchParams.set(key.trim(), value.trim());
            }
          });
          urlString = urlObj.toString();
        }

        const parsedUrl = new URL(urlString);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        // Build clean headers object - only include what the user specified
        const cleanHeaders: Record<string, string> = {};

        // Add user-specified headers
        Object.entries(updatedRequest.headers || {}).forEach(([key, value]) => {
          if (key.trim() && value.trim()) {
            cleanHeaders[key.trim()] = value.trim();
          }
        });

        // Add OAuth Authorization header if applicable
        if (updatedRequest.auth?.type === 'oauth2' && updatedRequest.auth.config.accessToken) {
          const headerPrefix = updatedRequest.auth.config.headerPrefix || 'Bearer';
          cleanHeaders['Authorization'] = `${headerPrefix} ${updatedRequest.auth.config.accessToken}`;
        }

        // Headers are already filtered by the UI based on checkbox state
        // No need to add default headers here as they're managed in the frontend

        // Handle request body and Content-Type
        let bodyData: string | Buffer | undefined;
        if (updatedRequest.body && updatedRequest.body.type !== 'none') {
          if (updatedRequest.body.type === 'json') {
            bodyData = updatedRequest.body.content;
            // Only set Content-Type if not already specified by user
            if (!cleanHeaders['Content-Type'] && !cleanHeaders['content-type']) {
              cleanHeaders['Content-Type'] = 'application/json';
            }
          } else if (updatedRequest.body.type === 'raw') {
            bodyData = updatedRequest.body.content;
          } else if (updatedRequest.body.type === 'form-urlencoded') {
            bodyData = updatedRequest.body.content;
            // Only set Content-Type if not already specified by user
            if (!cleanHeaders['Content-Type'] && !cleanHeaders['content-type']) {
              cleanHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
            }
          }

          // Set Content-Length if body exists
          if (bodyData && !cleanHeaders['Content-Length'] && !cleanHeaders['content-length']) {
            cleanHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
          }
        }

        const options: http.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: updatedRequest.method,
          headers: cleanHeaders,
        };

        const req = httpModule.request(options, (res) => {
          const chunks: Buffer[] = [];
          const rawChunks: Buffer[] = [];

          // Handle compressed responses
          const encoding = res.headers['content-encoding'];
          let responseStream: NodeJS.ReadableStream = res;

          // Collect raw compressed data for accurate size calculation
          res.on('data', (chunk: Buffer) => {
            rawChunks.push(chunk);
          });

          if (encoding === 'gzip') {
            responseStream = res.pipe(zlib.createGunzip());
          } else if (encoding === 'deflate') {
            responseStream = res.pipe(zlib.createInflate());
          } else if (encoding === 'br') {
            responseStream = res.pipe(zlib.createBrotliDecompress());
          }

          responseStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          responseStream.on('end', () => {
            const endTime = Date.now();
            const body = Buffer.concat(chunks).toString();

            const responseHeaders: Record<string, string> = {};
            Object.entries(res.headers).forEach(([key, value]) => {
              responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value || '';
            });

            // Calculate correct size: use compressed size if compression was used, otherwise uncompressed size
            const compressedSize = Buffer.concat(rawChunks).length;
            const uncompressedSize = Buffer.byteLength(body);
            const actualTransferSize = encoding ? compressedSize : uncompressedSize;

            resolve({
              status: res.statusCode || 0,
              statusText: res.statusMessage || '',
              headers: responseHeaders,
              body,
              time: endTime - startTime,
              size: actualTransferSize,
            });
          });

          responseStream.on('error', (error) => {
            const endTime = Date.now();
            const errorBody = this.formatDecompressionError(error);
            resolve({
              status: 422, // Unprocessable Entity - server sent bad data
              statusText: 'Decompression Error',
              headers: { 'Content-Type': 'application/json' },
              body: errorBody,
              time: endTime - startTime,
              size: Buffer.byteLength(errorBody),
            });
          });
        });

        req.on('error', (error) => {
          const endTime = Date.now();
          const errorBody = this.formatNetworkError(error, urlString);
          resolve({
            status: this.getErrorStatusCode(error),
            statusText: this.getErrorTitle(error),
            headers: { 'Content-Type': 'application/json' },
            body: errorBody,
            time: endTime - startTime,
            size: Buffer.byteLength(errorBody),
          });
        });

        // Write body data if present
        if (bodyData) {
          req.write(bodyData);
        }

        req.end();
      } catch (error) {
        const endTime = Date.now();
        const statusCode = this.getErrorStatusCode(error);
        const errorBody = this.formatGeneralError(error, request.url);
        resolve({
          status: statusCode,
          statusText: 'Request Failed',
          headers: { 'Content-Type': 'application/json' },
          body: errorBody,
          time: endTime - startTime,
          size: Buffer.byteLength(errorBody),
        });
      }
    });
  }

  private async handleOAuthRefresh(request: ApiRequest): Promise<ApiRequest> {
    // If not OAuth or no auth, return request as-is
    if (!request.auth || request.auth.type !== 'oauth2') {
      return request;
    }

    // Check if token needs refresh
    const tokenInfo = oauthManager.getTokenInfo(request.auth.config as any);

    if (tokenInfo.isValid) {
      return request; // Token is still valid
    }

    // Token is expired or will expire soon, try to refresh
    if (request.auth.config.refreshToken) {
      try {
        const refreshResult = await oauthManager.refreshToken(request.auth.config as any);

        if (refreshResult.success && refreshResult.data) {
          // Update the request with new token
          return {
            ...request,
            auth: {
              ...request.auth,
              config: {
                ...request.auth.config,
                accessToken: refreshResult.data.accessToken,
                refreshToken: refreshResult.data.refreshToken || request.auth.config.refreshToken,
                expiresAt: new Date(Date.now() + refreshResult.data.expiresIn * 1000).toISOString()
              }
            }
          };
        }
      } catch (error) {
        console.warn('Failed to refresh OAuth token:', error);
        // Continue with original request - it might still work or the user will see the error
      }
    }

    return request; // Return original request if refresh fails
  }

  private formatNetworkError(error: any, url: string): string {
    const errorData = {
      error: true,
      type: 'NetworkError',
      title: this.getErrorTitle(error),
      message: this.getDetailedErrorMessage(error),
      url: url,
      timestamp: new Date().toLocaleString(),
      details: {
        code: error.code || 'UNKNOWN',
        errno: error.errno || null,
        syscall: error.syscall || null,
        hostname: error.hostname || null,
        address: error.address || null,
        port: error.port || null
      },
      suggestions: this.getErrorSuggestions(error)
    };

    return JSON.stringify(errorData, null, 2);
  }

  private formatDecompressionError(error: any): string {
    const errorData = {
      error: true,
      type: 'DecompressionError',
      title: 'Response Decompression Failed',
      message: `Failed to decompress the response data: ${error.message}`,
      timestamp: new Date().toLocaleString(),
      details: {
        errorMessage: error.message,
        stack: error.stack
      },
      suggestions: [
        'The server may have sent corrupted compressed data',
        'Try disabling compression in your request headers',
        'Check if the server properly supports the compression method'
      ]
    };

    return JSON.stringify(errorData, null, 2);
  }

  private formatGeneralError(error: any, url: string): string {
    const errorData = {
      error: true,
      type: 'RequestError',
      title: 'Request Processing Failed',
      message: error instanceof Error ? error.message : 'An unknown error occurred while processing the request',
      url: url,
      timestamp: new Date().toLocaleString(),
      details: {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error)
      },
      suggestions: [
        'Check the request URL for typos',
        'Verify your network connection',
        'Try the request again'
      ]
    };

    return JSON.stringify(errorData, null, 2);
  }

  private getErrorStatusCode(error: any): number {
    // Check for TypeError which typically indicates client-side errors (like invalid URL)
    if (error instanceof TypeError) {
      if (error.message?.includes('Invalid URL')) {
        return 400; // Bad Request - invalid URL format
      }
      return 400; // Bad Request - client error
    }

    const code = error.code || error.errno;

    switch (code) {
      case 'ERR_INVALID_URL':
        return 400; // Bad Request - invalid URL
      case 'ENOTFOUND':
        return 503; // Service Unavailable - can't reach the service
      case 'ECONNREFUSED':
        return 502; // Bad Gateway - service is refusing connections
      case 'ECONNRESET':
        return 502; // Bad Gateway - connection was reset
      case 'ETIMEDOUT':
        return 504; // Gateway Timeout
      case 'ECONNABORTED':
        return 499; // Client Closed Request (similar to nginx 499)
      case 'EHOSTUNREACH':
        return 503; // Service Unavailable - host unreachable
      case 'ENETUNREACH':
        return 503; // Service Unavailable - network unreachable
      case 'EADDRINUSE':
        return 500; // Internal Server Error - local address issue
      case 'EADDRNOTAVAIL':
        return 500; // Internal Server Error - address not available
      case 'EPIPE':
        return 502; // Bad Gateway - broken pipe
      case 'EMFILE':
        return 500; // Internal Server Error - too many files
      case 'ENOENT':
        return 404; // Not Found
      case 'EACCES':
        return 403; // Forbidden
      default:
        return 500; // Internal Server Error - unknown network error
    }
  }

  private getErrorTitle(error: any): string {
    const code = error.code || error.errno;

    switch (code) {
      case 'ENOTFOUND':
        return 'Host Not Found';
      case 'ECONNREFUSED':
        return 'Connection Refused';
      case 'ECONNRESET':
        return 'Connection Reset';
      case 'ETIMEDOUT':
        return 'Connection Timeout';
      case 'ECONNABORTED':
        return 'Connection Aborted';
      case 'EHOSTUNREACH':
        return 'Host Unreachable';
      case 'ENETUNREACH':
        return 'Network Unreachable';
      case 'EADDRINUSE':
        return 'Address Already in Use';
      case 'EADDRNOTAVAIL':
        return 'Address Not Available';
      case 'EPIPE':
        return 'Broken Pipe';
      case 'EMFILE':
        return 'Too Many Open Files';
      case 'ENOENT':
        return 'File Not Found';
      case 'EACCES':
        return 'Permission Denied';
      default:
        return 'Network Error';
    }
  }

  private getDetailedErrorMessage(error: any): string {
    const code = error.code || error.errno;
    const hostname = error.hostname || 'unknown host';

    switch (code) {
      case 'ENOTFOUND':
        return `Could not resolve hostname "${hostname}". Please check the URL and your internet connection.`;
      case 'ECONNREFUSED':
        return `Connection to ${hostname} was refused. The server may be down or the port may be blocked.`;
      case 'ECONNRESET':
        return `Connection to ${hostname} was reset by the server. This may be temporary.`;
      case 'ETIMEDOUT':
        return `Connection to ${hostname} timed out. The server may be slow or unreachable.`;
      case 'ECONNABORTED':
        return `Connection to ${hostname} was aborted. The request may have been cancelled.`;
      case 'EHOSTUNREACH':
        return `Host ${hostname} is unreachable. Check your network connection and routing.`;
      case 'ENETUNREACH':
        return `Network is unreachable. Check your internet connection and network settings.`;
      case 'EADDRINUSE':
        return 'The local address is already in use. Try again in a moment.';
      case 'EADDRNOTAVAIL':
        return 'The specified address is not available. Check your network configuration.';
      case 'EPIPE':
        return 'Connection was broken while sending data. The server may have closed the connection.';
      case 'EMFILE':
        return 'Too many files are open. Close some applications and try again.';
      case 'ENOENT':
        return 'The requested resource was not found.';
      case 'EACCES':
        return 'Access denied. Check your permissions and authentication.';
      default:
        return error.message || 'An unexpected network error occurred.';
    }
  }

  private getErrorSuggestions(error: any): string[] {
    const code = error.code || error.errno;

    switch (code) {
      case 'ENOTFOUND':
        return [
          'Check if the hostname is spelled correctly',
          'Verify your internet connection is working',
          'Try using a different DNS server',
          'Check if you need to connect to a VPN',
          'Ensure the domain exists and is accessible'
        ];
      case 'ECONNREFUSED':
        return [
          'Verify the server is running and accessible',
          'Check if the port number is correct',
          'Ensure no firewall is blocking the connection',
          'Try connecting from a different network',
          'Contact the server administrator'
        ];
      case 'ECONNRESET':
        return [
          'Try the request again after a moment',
          'Check if the server has rate limiting',
          'Verify your request headers are correct',
          'Consider adding retry logic to your application'
        ];
      case 'ETIMEDOUT':
        return [
          'Increase the request timeout if possible',
          'Check your internet connection speed',
          'Try connecting from a different network',
          'Verify the server is not overloaded',
          'Consider using a different endpoint if available'
        ];
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return [
          'Check your internet connection',
          'Verify your network settings',
          'Try connecting to a different network',
          'Check if you need to use a VPN',
          'Contact your network administrator'
        ];
      default:
        return [
          'Check your internet connection',
          'Verify the request URL is correct',
          'Try the request again',
          'Contact the server administrator if the problem persists'
        ];
    }
  }
}

export const requestManager = new RequestManager();
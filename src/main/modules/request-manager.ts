import { ApiRequest, ApiResponse, RequestSettings } from '../../shared/types';
import { oauthManager } from './oauth';
import {
  composeFinalRequest,
  buildFolderVars,
  scanUnresolvedVars,
} from './variables';
import { storeManager } from './store-manager';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { URL } from 'url';
import { RequestBuilder } from './request-builder';
import { RequestErrorFormatter } from './request-error-formatter';
import { getHttpsAgentForRequest } from './https-agent-cache';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
} from '../../shared/constants';

/**
 * Decide the default scheme for a protocol-less URL.
 * Returns 'http' for loopback / private-LAN / `.local` hosts and any host
 * that explicitly carries a non-443 port; 'https' otherwise.
 */
function guessDefaultScheme(rawUrl: string): 'http' | 'https' {
  // Strip path/query/fragment — we only care about the authority component.
  const authority = rawUrl.split(/[/?#]/)[0] || '';
  if (!authority) return 'https';

  // Split off port. Bracketed IPv6: [::1]:8080
  let host = authority;
  const ipv6Match = authority.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (ipv6Match) {
    host = ipv6Match[1];
  } else {
    const colonIdx = authority.lastIndexOf(':');
    if (colonIdx > -1 && /^\d+$/.test(authority.slice(colonIdx + 1))) {
      host = authority.slice(0, colonIdx);
    }
  }

  const lowerHost = host.toLowerCase();

  // Loopback
  if (
    lowerHost === 'localhost' ||
    lowerHost === '0.0.0.0' ||
    lowerHost === '::1' ||
    lowerHost.endsWith('.localhost')
  ) {
    return 'http';
  }
  // mDNS / .local
  if (lowerHost.endsWith('.local')) return 'http';

  // IPv4 private ranges
  const ipv4 = lowerHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return 'http'; // loopback
    if (a === 10) return 'http'; // 10.0.0.0/8
    if (a === 192 && b === 168) return 'http'; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return 'http'; // 172.16.0.0/12
    if (a === 169 && b === 254) return 'http'; // link-local
  }

  return 'https';
}

class RequestManager {
  private activeRequests = new Map<
    string,
    { req: http.ClientRequest; reject: (err: Error) => void }
  >();

  async sendRequest(request: ApiRequest): Promise<ApiResponse> {
    const startTime = Date.now();
    const requestId = request.id || `request-${Date.now()}`;

    // Resolve variables first
    const state = storeManager.getState();
    const activeEnv = state.activeEnvironmentId
      ? state.environments.find((e) => e.id === state.activeEnvironmentId)
      : undefined;

    // Fix collectionId if it points to a request-type collection
    // buildFolderVars() only processes folder-type collections, so we need the parent folder ID
    let collectionIdForVars = request.collectionId;
    if (collectionIdForVars) {
      const collection = state.collections.find(
        (c) => c.id === collectionIdForVars
      );
      if (collection && collection.type === 'request' && collection.parentId) {
        collectionIdForVars = collection.parentId;
      }
    }

    // Build folder variables from ancestor chain
    const folderVars = buildFolderVars(collectionIdForVars, state.collections);

    const resolvedRequest = composeFinalRequest(
      request,
      activeEnv,
      state.globals,
      folderVars
    );

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

    // Check for unresolved variables across URL, headers, body, and auth
    // before attempting the request. Previously only the URL was scanned, so
    // a stray {{token}} in an Authorization header silently sent literally.
    const opts = {
      requestVars: request.variables || {},
      folderVars: folderVars || {},
      envVars: activeEnv?.variables || {},
      globalVars: state.globals?.variables || {},
    };
    const scanTargets: string[] = [updatedRequest.url];
    if (Array.isArray(updatedRequest.headers)) {
      updatedRequest.headers.forEach((h) => {
        if (h.enabled) scanTargets.push(h.key, h.value);
      });
    } else if (updatedRequest.headers) {
      Object.entries(updatedRequest.headers).forEach(([k, v]) => {
        scanTargets.push(k, String(v));
      });
    }
    if (updatedRequest.body?.content) {
      scanTargets.push(updatedRequest.body.content);
    }
    if (updatedRequest.auth?.config) {
      Object.values(updatedRequest.auth.config).forEach((v) => {
        if (typeof v === 'string') scanTargets.push(v);
      });
    }

    const unresolvedVarsSet = new Set<string>();
    for (const target of scanTargets) {
      if (typeof target !== 'string' || !target.includes('{{')) continue;
      scanUnresolvedVars(target, opts).forEach((v) => unresolvedVarsSet.add(v));
    }
    const unresolvedVars = Array.from(unresolvedVarsSet);
    if (unresolvedVars.length > 0) {
      const endTime = Date.now();
      const errorBody = RequestErrorFormatter.formatUnresolvedVariablesError(
        updatedRequest.url,
        unresolvedVars
      );
      return Promise.resolve({
        status: 400,
        statusText: 'Unresolved Variables',
        headers: { 'Content-Type': 'application/json' },
        body: errorBody,
        time: endTime - startTime,
        size: Buffer.byteLength(errorBody),
        timestamp: endTime,
      });
    }

    return new Promise<ApiResponse>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.activeRequests.delete(requestId);
      };

      const safeResolve = (response: ApiResponse): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(response);
      };

      const safeReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      try {
        const authQueryParams =
          RequestBuilder.buildAuthQueryParams(updatedRequest);
        const mergedParams = RequestBuilder.mergeParams(
          updatedRequest.params,
          authQueryParams
        );
        // Default protocol for protocol-less URLs.
        // - Loopback / private hosts (`localhost`, `127.x`, `0.0.0.0`,
        //   `::1`, `10.x`, `192.168.x`, `172.16-31.x`, plain `*.local`,
        //   anything with an explicit non-443 port) → http://
        //   This matches Insomnia/Postman behavior and avoids the WRONG_VERSION_NUMBER
        //   TLS handshake error users see when they type `localhost:8080`.
        // - Everything else (public hostnames) → https://, since silently
        //   sending plaintext to public endpoints is a bad default for a
        //   2026-era enterprise tool. Users who need plaintext for a public
        //   host can still type `http://` explicitly.
        const rawUrl = updatedRequest.url.trim();
        const normalizedUrl = /^https?:\/\//i.test(rawUrl)
          ? rawUrl
          : `${guessDefaultScheme(rawUrl)}://${rawUrl}`;
        const urlString = RequestBuilder.buildUrlWithParams(
          normalizedUrl,
          mergedParams
        );

        // Get request settings
        const settings = state.requestSettings;
        const timeoutMs =
          settings?.defaultTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const followRedirects = settings?.followRedirects ?? true;
        const maxRedirects = settings?.maxRedirects ?? 10;
        const maxResponseSize =
          settings?.maxResponseSizeBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        const proxyEnabled = settings?.proxyEnabled ?? false;
        const proxyUrl = settings?.proxyUrl?.trim() || '';

        const executeRequest = (
          targetUrl: string,
          redirectCount: number
        ): void => {
          const parsedUrl = new URL(targetUrl);
          const isHttps = parsedUrl.protocol === 'https:';
          const httpModule = isHttps ? https : http;

          // Build headers
          let cleanHeaders = RequestBuilder.buildHeaders(updatedRequest);

          // Build body
          const { bodyData, contentType } =
            RequestBuilder.buildBody(updatedRequest);

          // Add default headers
          cleanHeaders = RequestBuilder.addDefaultHeaders(
            cleanHeaders,
            bodyData,
            contentType
          );

          // Add Accept-Encoding if not specified by user (case-insensitive).
          const hasAcceptEncoding = Object.keys(cleanHeaders).some(
            (k) => k.toLowerCase() === 'accept-encoding'
          );
          if (!hasAcceptEncoding) {
            cleanHeaders['Accept-Encoding'] = 'gzip, deflate, br';
          }

          const options: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: updatedRequest.method,
            headers: cleanHeaders,
          };

          // Build mTLS / insecure-TLS agent (cached by cert fingerprint so
          // repeat calls to the same host reuse the keep-alive connection).
          if (isHttps) {
            const agent = getHttpsAgentForRequest(updatedRequest);
            if (agent) options.agent = agent;
          }

          // Apply HTTP proxy for non-HTTPS (simple proxy) targets
          if (proxyEnabled && proxyUrl && !isHttps) {
            try {
              const proxyParsed = new URL(proxyUrl);
              options.hostname = proxyParsed.hostname;
              options.port = parseInt(proxyParsed.port || '80', 10);
              options.path = targetUrl; // full URL as path for proxy
            } catch (err) {
              // Don't silently fall through to direct connection — the user
              // explicitly asked for a proxy and a silent fallback would
              // leak the request around their network controls.
              console.warn(
                '[request] invalid proxy URL, aborting request:',
                proxyUrl
              );
              safeReject(
                new Error(
                  `Invalid proxy URL configured in settings: "${proxyUrl}". ` +
                    `(${(err as Error).message})`
                )
              );
              return;
            }
          }

          // For HTTPS through proxy, use CONNECT tunnel
          if (proxyEnabled && proxyUrl && isHttps && !options.agent) {
            try {
              const proxyParsed = new URL(proxyUrl);
              this.createProxyTunnel(
                proxyParsed,
                parsedUrl,
                options,
                updatedRequest,
                bodyData,
                requestId,
                startTime,
                timeoutMs,
                safeResolve,
                safeReject,
                followRedirects,
                maxRedirects,
                redirectCount,
                maxResponseSize,
                executeRequest
              );
              return;
            } catch (err) {
              console.warn(
                '[request] failed to set up HTTPS-over-proxy tunnel:',
                proxyUrl
              );
              safeReject(
                new Error(
                  `Failed to set up HTTPS proxy tunnel for "${proxyUrl}": ${(err as Error).message}`
                )
              );
              return;
            }
          }

          const req = httpModule.request(options, (res) => {
            // Handle redirects
            const statusCode = res.statusCode || 0;
            if (
              followRedirects &&
              [301, 302, 303, 307, 308].includes(statusCode) &&
              res.headers.location
            ) {
              if (redirectCount >= maxRedirects) {
                const endTime = Date.now();
                const errorBody = JSON.stringify(
                  {
                    error: 'Too Many Redirects',
                    message: `Exceeded maximum of ${maxRedirects} redirects`,
                    url: targetUrl,
                    redirectCount,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                );
                safeResolve({
                  status: 0,
                  statusText: 'Too Many Redirects',
                  headers: { 'Content-Type': 'application/json' },
                  body: errorBody,
                  time: endTime - startTime,
                  size: Buffer.byteLength(errorBody),
                  timestamp: endTime,
                });
                return;
              }

              // Resolve relative redirect URLs
              const redirectUrl = new URL(
                res.headers.location,
                targetUrl
              ).toString();

              // For 303, switch to GET and drop body. We mutate the LOCAL
              // `updatedRequest` (already a clone from the start of
              // sendRequest); the caller's ApiRequest is untouched.
              if (statusCode === 303) {
                updatedRequest.method = 'GET';
                updatedRequest.body = { type: 'none', content: '' };
              }

              // Consume current response and follow redirect
              res.resume();
              executeRequest(redirectUrl, redirectCount + 1);
              return;
            }

            this.handleResponse(res, startTime, safeResolve, maxResponseSize);
          });

          req.on('error', (error) => {
            this.handleRequestError(error, targetUrl, startTime, safeResolve);
          });

          // Set timeout
          if (timeoutMs > 0) {
            req.setTimeout(timeoutMs, () => {
              req.destroy(
                new Error(`Request timed out after ${timeoutMs / 1000}s`)
              );
            });
          }

          this.activeRequests.set(requestId, { req, reject: safeReject });

          // Write body data if present. Redirected GETs already have body
          // cleared in the 303 branch above.
          if (bodyData) {
            req.write(bodyData);
          }

          req.end();
        };

        executeRequest(urlString, 0);
      } catch (error) {
        this.handleGeneralError(
          error,
          updatedRequest.url,
          startTime,
          safeResolve
        );
      }
    });
  }

  cancelRequest(requestId: string): boolean {
    const active = this.activeRequests.get(requestId);

    if (!active) {
      return false;
    }

    // Reject the in-flight Promise FIRST so the imminent `error` event
    // triggered by `req.destroy()` is short-circuited by the `settled` flag
    // inside safeResolve/safeReject. Without this, cancellation surfaces as
    // a fake "Request Failed" response in the UI instead of a clean
    // request-cancelled event. The renderer's catch block keys off the
    // string "cancel" in the error message, so keep that wording stable.
    active.reject(new Error('Request cancelled by user'));
    active.req.destroy();
    return true;
  }

  private createProxyTunnel(
    proxyParsed: URL,
    targetParsed: URL,
    options: http.RequestOptions,
    updatedRequest: ApiRequest,
    bodyData: string | Buffer | undefined,
    requestId: string,
    startTime: number,
    timeoutMs: number,
    safeResolve: (response: ApiResponse) => void,
    safeReject: (error: Error) => void,
    followRedirects: boolean,
    maxRedirects: number,
    redirectCount: number,
    maxResponseSize: number,
    executeRequest: (targetUrl: string, redirectCount: number) => void
  ): void {
    const connectReq = http.request({
      host: proxyParsed.hostname,
      port: parseInt(proxyParsed.port || '80', 10),
      method: 'CONNECT',
      path: `${targetParsed.hostname}:${targetParsed.port || 443}`,
    });

    connectReq.on('connect', (_res, socket) => {
      const agent = new https.Agent({ socket });
      options.agent = agent;

      const req = https.request(options, (res) => {
        const statusCode = res.statusCode || 0;
        if (
          followRedirects &&
          [301, 302, 303, 307, 308].includes(statusCode) &&
          res.headers.location
        ) {
          if (redirectCount >= maxRedirects) {
            const endTime = Date.now();
            const errorBody = JSON.stringify(
              {
                error: 'Too Many Redirects',
                message: `Exceeded maximum of ${maxRedirects} redirects`,
              },
              null,
              2
            );
            safeResolve({
              status: 0,
              statusText: 'Too Many Redirects',
              headers: { 'Content-Type': 'application/json' },
              body: errorBody,
              time: endTime - startTime,
              size: Buffer.byteLength(errorBody),
              timestamp: endTime,
            });
            return;
          }
          const redirectUrl = new URL(
            res.headers.location,
            `https://${targetParsed.hostname}`
          ).toString();
          res.resume();
          executeRequest(redirectUrl, redirectCount + 1);
          return;
        }
        this.handleResponse(res, startTime, safeResolve, maxResponseSize);
      });

      req.on('error', (error) => {
        this.handleRequestError(
          error,
          targetParsed.href,
          startTime,
          safeResolve
        );
      });

      if (timeoutMs > 0) {
        req.setTimeout(timeoutMs, () => {
          req.destroy(
            new Error(`Request timed out after ${timeoutMs / 1000}s`)
          );
        });
      }

      this.activeRequests.set(requestId, { req, reject: safeReject });

      if (bodyData && updatedRequest.method !== 'GET') {
        req.write(bodyData);
      }

      req.end();
    });

    connectReq.on('error', (error) => {
      this.handleRequestError(error, targetParsed.href, startTime, safeResolve);
    });

    if (timeoutMs > 0) {
      connectReq.setTimeout(timeoutMs, () => {
        connectReq.destroy(
          new Error(`Proxy tunnel timed out after ${timeoutMs / 1000}s`)
        );
      });
    }

    connectReq.end();
  }

  private handleResponse(
    res: http.IncomingMessage,
    startTime: number,
    resolve: (value: ApiResponse) => void,
    maxResponseSize: number = DEFAULT_MAX_RESPONSE_BYTES
  ): void {
    const chunks: Buffer[] = [];
    const rawChunks: Buffer[] = [];
    let totalDecompressedSize = 0;
    let sizeLimitExceeded = false;

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
      totalDecompressedSize += chunk.length;
      if (totalDecompressedSize > maxResponseSize) {
        if (!sizeLimitExceeded) {
          sizeLimitExceeded = true;
          // Destroy the response stream to stop reading
          res.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });

    responseStream.on('end', () => {
      if (sizeLimitExceeded) {
        const endTime = Date.now();
        const errorBody = JSON.stringify(
          {
            error: 'Response Too Large',
            message: `Response body exceeded the ${(maxResponseSize / 1024 / 1024).toFixed(0)} MB limit and was truncated`,
            truncatedSize: totalDecompressedSize,
            maxSize: maxResponseSize,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        );

        const responseHeaders: Record<string, string> = {};
        Object.entries(res.headers).forEach(([key, value]) => {
          responseHeaders[key] = Array.isArray(value)
            ? value.join(', ')
            : value || '';
        });

        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: responseHeaders,
          // IMPORTANT: do NOT append a marker string into `body` — that
          // corrupts JSON/XML/binary payloads. Use the `truncated` flag and
          // let the UI render a banner above the partial body instead.
          body: Buffer.concat(chunks).toString(),
          time: endTime - startTime,
          size: totalDecompressedSize,
          timestamp: endTime,
          truncated: true,
          truncatedSize: totalDecompressedSize,
        });
        return;
      }

      const endTime = Date.now();
      const body = Buffer.concat(chunks).toString();

      const responseHeaders: Record<string, string> = {};
      Object.entries(res.headers).forEach(([key, value]) => {
        responseHeaders[key] = Array.isArray(value)
          ? value.join(', ')
          : value || '';
      });

      // Calculate correct size
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
        timestamp: endTime,
      });
    });

    responseStream.on('error', (error) => {
      const endTime = Date.now();
      const errorBody = RequestErrorFormatter.formatDecompressionError(error);
      resolve({
        status: 422,
        statusText: 'Decompression Error',
        headers: { 'Content-Type': 'application/json' },
        body: errorBody,
        time: endTime - startTime,
        size: Buffer.byteLength(errorBody),
        timestamp: endTime,
      });
    });
  }

  private handleRequestError(
    error: any,
    url: string,
    startTime: number,
    resolve: (value: ApiResponse) => void
  ): void {
    const endTime = Date.now();
    const errorBody = RequestErrorFormatter.formatNetworkError(error, url);
    resolve({
      status: RequestErrorFormatter.getErrorStatusCode(error),
      statusText: RequestErrorFormatter.getErrorTitle(error),
      headers: { 'Content-Type': 'application/json' },
      body: errorBody,
      time: endTime - startTime,
      size: Buffer.byteLength(errorBody),
      timestamp: endTime,
    });
  }

  private handleGeneralError(
    error: any,
    url: string,
    startTime: number,
    resolve: (value: ApiResponse) => void
  ): void {
    const endTime = Date.now();
    const statusCode = RequestErrorFormatter.getErrorStatusCode(error);
    const errorBody = RequestErrorFormatter.formatGeneralError(error, url);
    resolve({
      status: statusCode,
      statusText: 'Request Failed',
      headers: { 'Content-Type': 'application/json' },
      body: errorBody,
      time: endTime - startTime,
      size: Buffer.byteLength(errorBody),
      timestamp: endTime,
    });
  }

  private async handleOAuthRefresh(request: ApiRequest): Promise<ApiRequest> {
    if (!request.auth || request.auth.type !== 'oauth2') {
      return request;
    }

    const tokenInfo = oauthManager.getTokenInfo(request.auth.config as any);

    if (tokenInfo.isValid) {
      return request;
    }

    if (request.auth.config.refreshToken) {
      try {
        const refreshResult = await oauthManager.refreshToken(
          request.auth.config as any
        );

        if (refreshResult.success && refreshResult.data) {
          return {
            ...request,
            auth: {
              ...request.auth,
              config: {
                ...request.auth.config,
                accessToken: refreshResult.data.accessToken,
                refreshToken:
                  refreshResult.data.refreshToken ||
                  request.auth.config.refreshToken,
                expiresAt: new Date(
                  Date.now() + refreshResult.data.expiresIn * 1000
                ).toISOString(),
              },
            },
          };
        }
      } catch (error) {
        // OAuth refresh failed - continue with existing token
      }
    }

    return request;
  }
}

export const requestManager = new RequestManager();

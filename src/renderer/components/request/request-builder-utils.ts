import { ApiRequest } from '../../../shared/types';

// Re-export shared utilities (single source of truth)
export {
  resolveContentType,
  buildAuthQueryParams,
  hasHeader,
  collectParams,
  appendParamsWithoutEncoding,
  buildUrlWithParams,
  buildBody,
} from '../../../shared/request-builder-shared';

/**
 * Builds headers from a request, including auth headers.
 * Renderer-specific: uses btoa + TextEncoder for Base64 encoding
 * (the main process version uses Buffer.from).
 */
export function buildHeaders(request: ApiRequest): Record<string, string> {
  const cleanHeaders: Record<string, string> = {};

  if (request.headers) {
    if (Array.isArray(request.headers)) {
      request.headers.forEach(({ key, value, enabled }) => {
        if (enabled && key.trim()) {
          cleanHeaders[key.trim()] = value.trim();
        }
      });
    } else {
      Object.entries(request.headers).forEach(([key, value]) => {
        if (key.trim()) {
          cleanHeaders[key.trim()] = value.trim();
        }
      });
    }
  }

  if (request.auth?.type === 'oauth2' && request.auth.config.accessToken) {
    const headerPrefix = request.auth.config.headerPrefix || 'Bearer';
    cleanHeaders['Authorization'] =
      `${headerPrefix} ${request.auth.config.accessToken}`;
  }

  if (request.auth?.type === 'bearer' && request.auth.config.token) {
    cleanHeaders['Authorization'] = `Bearer ${request.auth.config.token}`;
  }

  if (
    request.auth?.type === 'api-key' &&
    request.auth.config.location === 'header'
  ) {
    const key = request.auth.config.key || 'X-API-Key';
    if (request.auth.config.value) {
      cleanHeaders[key] = request.auth.config.value;
    }
  }

  if (
    request.auth?.type === 'basic' &&
    request.auth.config.username &&
    request.auth.config.password
  ) {
    const credentials = `${request.auth.config.username}:${request.auth.config.password}`;
    const encoded = btoa(
      new Uint8Array(new TextEncoder().encode(credentials)).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );
    cleanHeaders['Authorization'] = `Basic ${encoded}`;
  }

  return cleanHeaders;
}

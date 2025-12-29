import { ApiRequest } from '../../../shared/types';

/**
 * Builds headers from a request, including auth headers
 */
export function buildHeaders(request: ApiRequest): Record<string, string> {
  const cleanHeaders: Record<string, string> = {};

  if (request.headers) {
    if (Array.isArray(request.headers)) {
      request.headers.forEach(({ key, value, enabled }) => {
        if (enabled && key.trim() && value.trim()) {
          cleanHeaders[key.trim()] = value.trim();
        }
      });
    } else {
      Object.entries(request.headers).forEach(([key, value]) => {
        if (key.trim() && value.trim()) {
          cleanHeaders[key.trim()] = value.trim();
        }
      });
    }
  }

  if (request.auth?.type === 'oauth2' && request.auth.config.accessToken) {
    const headerPrefix = request.auth.config.headerPrefix || 'Bearer';
    cleanHeaders['Authorization'] = `${headerPrefix} ${request.auth.config.accessToken}`;
  }

  if (request.auth?.type === 'bearer' && request.auth.config.token) {
    cleanHeaders['Authorization'] = `Bearer ${request.auth.config.token}`;
  }

  if (request.auth?.type === 'api-key' && request.auth.config.location === 'header') {
    const key = request.auth.config.key || 'X-API-Key';
    if (request.auth.config.value) {
      cleanHeaders[key] = request.auth.config.value;
    }
  }

  if (request.auth?.type === 'basic' && request.auth.config.username && request.auth.config.password) {
    const credentials = `${request.auth.config.username}:${request.auth.config.password}`;
    const encoded = btoa(credentials);
    cleanHeaders['Authorization'] = `Basic ${encoded}`;
  }

  return cleanHeaders;
}

/**
 * Builds auth query parameters from a request
 */
export function buildAuthQueryParams(request: ApiRequest): Record<string, string> {
  if (request.auth?.type === 'api-key' && request.auth.config.location === 'query') {
    const key = request.auth.config.key || 'api_key';
    const value = request.auth.config.value || '';
    if (key.trim() && value.trim()) {
      return { [key]: value };
    }
  }

  return {};
}

/**
 * Resolves the content type for a request body
 */
export function resolveContentType(body: ApiRequest['body']): string | undefined {
  if (!body) return undefined;

  if (body.contentType) {
    return body.contentType;
  }

  switch (body.format) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'yaml':
      return 'application/x-yaml';
    case 'text':
      return 'text/plain';
    case 'form-urlencoded':
      return 'application/x-www-form-urlencoded';
    default:
      break;
  }

  switch (body.type) {
    case 'json':
      return 'application/json';
    case 'form-urlencoded':
      return 'application/x-www-form-urlencoded';
    default:
      return undefined;
  }
}

/**
 * Builds the body data and content type from a request
 */
export function buildBody(request: ApiRequest): { bodyData?: string; contentType?: string } {
  if (!request.body || request.body.type === 'none') {
    return {};
  }

  const bodyData = request.body.content || '';
  const contentType = resolveContentType(request.body);

  return { bodyData, contentType };
}

/**
 * Collects params from array or object format, plus extra params
 */
export function collectParams(
  params?: ApiRequest['params'],
  extraParams?: Record<string, string>
): Array<{ key: string; value: string }> {
  const merged: Array<{ key: string; value: string }> = [];

  if (params) {
    if (Array.isArray(params)) {
      params.forEach(({ key, value, enabled }) => {
        if (enabled && key.trim() && value.trim()) {
          merged.push({ key: key.trim(), value: value.trim() });
        }
      });
    } else {
      Object.entries(params).forEach(([key, value]) => {
        if (key.trim() && value.trim()) {
          merged.push({ key: key.trim(), value: value.trim() });
        }
      });
    }
  }

  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (key.trim() && value.trim()) {
        merged.push({ key: key.trim(), value: value.trim() });
      }
    });
  }

  return merged;
}

/**
 * Appends params to a URL without encoding (for template variable URLs)
 */
export function appendParamsWithoutEncoding(
  baseUrl: string,
  params: Array<{ key: string; value: string }>
): string {
  const [urlWithoutHash, hash] = baseUrl.split('#');
  const separator = urlWithoutHash.includes('?') ? '&' : '?';
  const query = params.map(({ key, value }) => `${key}=${value}`).join('&');
  const rebuilt = `${urlWithoutHash}${separator}${query}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

/**
 * Builds a URL with query parameters, handling template variables
 */
export function buildUrlWithParams(
  baseUrl: string,
  params?: ApiRequest['params'],
  extraParams?: Record<string, string>
): string {
  const mergedParams = collectParams(params, extraParams);
  if (mergedParams.length === 0) {
    return baseUrl;
  }

  const hasTemplateVars = baseUrl.includes('{{');
  if (hasTemplateVars) {
    return appendParamsWithoutEncoding(baseUrl, mergedParams);
  }

  try {
    const [urlWithoutHash, hash] = baseUrl.split('#');
    const [path, queryString = ''] = urlWithoutHash.split('?');
    const searchParams = new URLSearchParams(queryString);

    mergedParams.forEach(({ key, value }) => {
      searchParams.set(key, value);
    });

    const query = searchParams.toString();
    const rebuilt = query ? `${path}?${query}` : path;
    return hash ? `${rebuilt}#${hash}` : rebuilt;
  } catch {
    return appendParamsWithoutEncoding(baseUrl, mergedParams);
  }
}

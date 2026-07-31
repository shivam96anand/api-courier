/**
 * Shared request building utilities used by both main process and renderer.
 * Environment-specific functions (e.g., Buffer vs btoa) remain in their
 * respective modules.
 */

import { ApiRequest, KeyValuePair } from './types';

/**
 * Resolves the content type for a request body
 */
export function resolveContentType(
  body: ApiRequest['body']
): string | undefined {
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
    case 'form-data':
      return 'multipart/form-data';
    case 'form-urlencoded':
      return 'application/x-www-form-urlencoded';
    default:
      return undefined;
  }
}

/**
 * Builds auth query parameters from a request
 */
export function buildAuthQueryParams(
  request: ApiRequest
): Record<string, string> {
  if (
    request.auth?.type === 'api-key' &&
    request.auth.config.location === 'query'
  ) {
    const key = request.auth.config.key || 'api_key';
    const value = request.auth.config.value || '';
    if (key.trim() && value.trim()) {
      return { [key]: value };
    }
  }

  return {};
}

/**
 * Checks if a header exists (case-insensitive)
 */
export function hasHeader(
  headers: Record<string, string>,
  headerName: string
): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

/**
 * Collects params from array or object format, plus extra params.
 * Allows empty values (e.g., ?flag=) — only requires a non-empty key.
 */
export function collectParams(
  params?: KeyValuePair[] | Record<string, string>,
  extraParams?: Record<string, string>
): Array<{ key: string; value: string }> {
  const merged: Array<{ key: string; value: string }> = [];

  if (params) {
    if (Array.isArray(params)) {
      params.forEach(({ key, value, enabled }) => {
        const cleanKey = (key ?? '').trim();
        if (enabled && cleanKey) {
          merged.push({ key: cleanKey, value: (value ?? '').trim() });
        }
      });
    } else {
      Object.entries(params).forEach(([key, value]) => {
        const cleanKey = (key ?? '').trim();
        if (cleanKey) {
          merged.push({ key: cleanKey, value: (value ?? '').trim() });
        }
      });
    }
  }

  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      const cleanKey = (key ?? '').trim();
      if (cleanKey) {
        merged.push({ key: cleanKey, value: (value ?? '').trim() });
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

// URLSearchParams serializes using application/x-www-form-urlencoded rules,
// which percent-encode every reserved character — including the RFC 3986
// sub-delimiters (",", ":", "/", "@", …) that are perfectly legal and expected
// to stay literal in the query component (`query = *( pchar / "/" / "?" )`).
// Some real-world APIs treat, e.g., "%2C" as a single literal token instead of
// a list separator (`?ids=a,b` vs `?ids=a%2Cb`), returning wrong results.
// We restore those characters AFTER serialization to match Postman/Insomnia,
// and normalize spaces from "+" to "%20" (also matching Postman/Insomnia and
// RFC 3986 — a literal "+" is already "%2B" at this point, so this is
// unambiguous). Structural characters (& = # and a literal +) stay encoded.
const QUERY_RESTORE_MAP: Record<string, string> = {
  '%2C': ',',
  '%2F': '/',
  '%3A': ':',
  '%3F': '?',
  '%40': '@',
  '%24': '$',
  '%21': '!',
  '%27': "'",
  '%28': '(',
  '%29': ')',
  '%2A': '*',
};

/**
 * Restores RFC 3986 query-safe characters that URLSearchParams over-encodes and
 * normalizes spaces to "%20", so query strings match Postman/Insomnia (e.g.
 * commas in a list stay literal and spaces become "%20" rather than "+").
 */
export function restoreQuerySafeChars(query: string): string {
  return query
    .replace(
      /%(?:2C|2F|3A|3F|40|24|21|27|28|29|2A)/gi,
      (match) => QUERY_RESTORE_MAP[match.toUpperCase()]
    )
    .replace(/\+/g, '%20');
}

/**
 * Builds a URL with query parameters, handling template variables
 */
export function buildUrlWithParams(
  baseUrl: string,
  params?: KeyValuePair[] | Record<string, string>,
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

    // Params override matching keys already present in the URL's query, but
    // multiple param rows that share a key are ALL kept (?id=1&id=2), matching
    // Postman/Insomnia. So drop each overridden key once, then append all.
    new Set(mergedParams.map((p) => p.key)).forEach((key) =>
      searchParams.delete(key)
    );
    mergedParams.forEach(({ key, value }) => {
      searchParams.append(key, value);
    });

    const query = restoreQuerySafeChars(searchParams.toString());
    const rebuilt = query ? `${path}?${query}` : path;
    return hash ? `${rebuilt}#${hash}` : rebuilt;
  } catch {
    return appendParamsWithoutEncoding(baseUrl, mergedParams);
  }
}

/**
 * Methods with no defined request-body semantics. Proxies, CDNs and many
 * servers drop or reject a body on these, so Restbro omits it unless the user
 * explicitly opts in per request.
 */
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

export function isBodylessMethod(method: string | undefined): boolean {
  return BODYLESS_METHODS.has((method || 'GET').toUpperCase());
}

/** True when the request carries content the user intends to send. */
export function hasSendableBodyContent(request: ApiRequest): boolean {
  const body = request.body;
  if (!body || body.type === 'none') return false;
  if (body.type === 'form-data') {
    return Boolean(body.formDataFields?.length) || Boolean(body.content);
  }
  return Boolean(body.content);
}

/** True when a body exists but is being withheld because of the method. */
export function isBodySuppressedByMethod(request: ApiRequest): boolean {
  return (
    hasSendableBodyContent(request) &&
    isBodylessMethod(request.method) &&
    request.allowBodyOnBodylessMethod !== true
  );
}

/**
 * Builds the body data and content type from a request.
 * Note: multipart/form-data encoding is handled by the main process
 * request-builder only (requires Buffer). This returns raw content for
 * display purposes (cURL preview).
 */
export function buildBody(request: ApiRequest): {
  bodyData?: string;
  contentType?: string;
} {
  if (!request.body || request.body.type === 'none') {
    return {};
  }
  if (isBodySuppressedByMethod(request)) {
    return {};
  }

  const bodyData = request.body.content || '';
  const contentType = resolveContentType(request.body);

  return { bodyData, contentType };
}

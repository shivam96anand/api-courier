import { ApiRequest } from '../../../shared/types';
import { buildHeaders, buildBody, buildUrlWithParams, buildAuthQueryParams } from './request-builder-utils';

/**
 * Shell-escapes a value for safe use in a shell command
 */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Builds the URL, header arguments, and body argument for a cURL command
 */
export function buildCurlParts(request: ApiRequest): { url: string; headerArgs: string[]; bodyArg?: string } {
  const headers = buildHeaders(request);
  const { bodyData, contentType } = buildBody(request);
  const headerArgs: string[] = [];

  if (contentType && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = contentType;
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (key.trim() && value.trim()) {
      headerArgs.push(`${key.trim()}: ${value.trim()}`);
    }
  });

  const url = buildUrlWithParams(request.url, request.params, buildAuthQueryParams(request));
  return { url, headerArgs, bodyArg: bodyData || undefined };
}

/**
 * Checks if a header exists (case-insensitive)
 */
function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

/**
 * Builds a complete cURL command string from a request
 */
export function buildCurlCommand(request: ApiRequest): string {
  const method = request.method || 'GET';
  const { url, headerArgs, bodyArg } = buildCurlParts(request);
  const parts = ['curl', '-X', method, shellEscape(url)];

  headerArgs.forEach((header) => {
    parts.push('-H', shellEscape(header));
  });

  if (bodyArg) {
    parts.push('--data-raw', shellEscape(bodyArg));
  }

  return parts.join(' ');
}

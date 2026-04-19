/**
 * Request building utilities
 */

import { ApiRequest, FormDataField, KeyValuePair } from '../../shared/types';
import { readFileSync } from 'fs';
import * as path from 'path';

export class RequestBuilder {
  public static buildUrlWithParams(
    baseUrl: string,
    params?: KeyValuePair[] | Record<string, string>
  ): string {
    const paramEntries = this.collectEntries(params);
    if (paramEntries.length === 0) {
      return baseUrl;
    }

    const hashIndex = baseUrl.indexOf('#');
    const hash = hashIndex >= 0 ? baseUrl.slice(hashIndex) : '';
    const urlWithoutHash =
      hashIndex >= 0 ? baseUrl.slice(0, hashIndex) : baseUrl;
    const queryIndex = urlWithoutHash.indexOf('?');
    const path =
      queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
    const queryString =
      queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';
    const searchParams = new URLSearchParams(queryString);

    paramEntries.forEach(([key, value]) => {
      searchParams.set(key, value);
    });

    const query = searchParams.toString();
    return `${query ? `${path}?${query}` : path}${hash}`;
  }

  public static buildHeaders(request: ApiRequest): Record<string, string> {
    const cleanHeaders: Record<string, string> = {};

    // Add user-specified headers, handling both formats.
    // Empty values ARE allowed (some APIs require empty headers like
    // `X-Trace-Hint:`). We only skip when the KEY is blank.
    if (request.headers) {
      if (Array.isArray(request.headers)) {
        request.headers.forEach(({ key, value, enabled }) => {
          if (enabled && key.trim()) {
            cleanHeaders[key.trim()] = (value ?? '').trim();
          }
        });
      } else {
        Object.entries(request.headers).forEach(([key, value]) => {
          if (key.trim()) {
            cleanHeaders[key.trim()] = (value ?? '').toString().trim();
          }
        });
      }
    }

    // Add OAuth Authorization header if applicable
    if (
      request.auth?.type === 'oauth2' &&
      request.auth.config.accessToken &&
      !this.hasHeader(cleanHeaders, 'Authorization')
    ) {
      const headerPrefix = request.auth.config.headerPrefix || 'Bearer';
      cleanHeaders['Authorization'] =
        `${headerPrefix} ${request.auth.config.accessToken}`;
    }

    if (
      request.auth?.type === 'bearer' &&
      request.auth.config.token &&
      !this.hasHeader(cleanHeaders, 'Authorization')
    ) {
      cleanHeaders['Authorization'] = `Bearer ${request.auth.config.token}`;
    }

    if (
      request.auth?.type === 'api-key' &&
      request.auth.config.location === 'header'
    ) {
      const key = request.auth.config.key || 'X-API-Key';
      if (request.auth.config.value && !this.hasHeader(cleanHeaders, key)) {
        cleanHeaders[key] = request.auth.config.value;
      }
    }

    if (
      request.auth?.type === 'basic' &&
      request.auth.config.username &&
      request.auth.config.password &&
      !this.hasHeader(cleanHeaders, 'Authorization')
    ) {
      const credentials = `${request.auth.config.username}:${request.auth.config.password}`;
      const encoded = Buffer.from(credentials, 'utf8').toString('base64');
      cleanHeaders['Authorization'] = `Basic ${encoded}`;
    }

    // Normalize SOAPAction header casing. Some intermediaries are picky and
    // only honour the canonical "SOAPAction" capitalization. Users routinely
    // type "soapaction" / "Soap-Action" / "SoapAction" — fold any variant
    // back to the canonical form (only when the request is SOAP).
    if (request.soap) {
      const canonical = 'SOAPAction';
      for (const key of Object.keys(cleanHeaders)) {
        if (
          key !== canonical &&
          key.toLowerCase().replace(/-/g, '') === 'soapaction'
        ) {
          cleanHeaders[canonical] = cleanHeaders[key];
          delete cleanHeaders[key];
        }
      }
    }

    return cleanHeaders;
  }

  public static buildAuthQueryParams(
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

  public static mergeParams(
    params?: KeyValuePair[] | Record<string, string>,
    extraParams?: Record<string, string>
  ): KeyValuePair[] | Record<string, string> | undefined {
    if (!extraParams || Object.keys(extraParams).length === 0) {
      return params;
    }

    if (!params) {
      return extraParams;
    }

    if (Array.isArray(params)) {
      const extras = Object.entries(extraParams).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      }));
      return [...params, ...extras];
    }

    return { ...params, ...extraParams };
  }

  public static buildBody(request: ApiRequest): {
    bodyData?: string | Buffer;
    contentType?: string;
  } {
    if (!request.body || request.body.type === 'none') {
      return {};
    }

    const body = request.body;

    // Handle multipart/form-data with structured fields (files + text)
    if (body.type === 'form-data') {
      if (body.formDataFields && body.formDataFields.length > 0) {
        const { buffer, contentType } = this.buildMultipartBodyFromFields(
          body.formDataFields
        );
        return { bodyData: buffer, contentType };
      }
      // Fallback: legacy key=value text format
      if (body.content) {
        const { buffer, contentType } = this.buildMultipartBody(body.content);
        return { bodyData: buffer, contentType };
      }
      return {};
    }

    const bodyData: string | Buffer | undefined = body.content;
    const contentType = this.resolveContentType(body);

    return { bodyData, contentType };
  }

  /**
   * Builds multipart/form-data from structured FormDataField array
   * Supports both text fields and file uploads
   */
  private static buildMultipartBodyFromFields(fields: FormDataField[]): {
    buffer: Buffer;
    contentType: string;
  } {
    const boundary = `----RestbroBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const parts: Buffer[] = [];
    const CRLF = '\r\n';

    for (const field of fields) {
      if (!field.enabled || !field.key.trim()) continue;

      const key = field.key.trim();

      if (field.type === 'file' && field.value) {
        // File field — read file from disk
        try {
          const fileData = readFileSync(field.value);
          const fileName = field.fileName || path.basename(field.value);
          const mimeType = field.contentType || 'application/octet-stream';

          const header = Buffer.from(
            `--${boundary}${CRLF}` +
              `Content-Disposition: form-data; name="${key}"; filename="${fileName}"${CRLF}` +
              `Content-Type: ${mimeType}${CRLF}${CRLF}`
          );
          parts.push(header);
          parts.push(fileData);
          parts.push(Buffer.from(CRLF));
        } catch {
          // Skip file if it can't be read (e.g. deleted after selection)
          continue;
        }
      } else {
        // Text field
        parts.push(
          Buffer.from(
            `--${boundary}${CRLF}` +
              `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
              `${field.value}${CRLF}`
          )
        );
      }
    }

    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    return {
      buffer: Buffer.concat(parts),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  /**
   * Builds a proper multipart/form-data body with boundary
   * Parses key=value pairs separated by newlines (legacy format)
   */
  private static buildMultipartBody(content: string): {
    buffer: Buffer;
    contentType: string;
  } {
    const boundary = `----RestbroBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const parts: Buffer[] = [];
    const CRLF = '\r\n';

    const lines = content.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1);

      if (!key) continue;

      parts.push(
        Buffer.from(
          `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
            `${value}${CRLF}`
        )
      );
    }

    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    return {
      buffer: Buffer.concat(parts),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  public static addDefaultHeaders(
    headers: Record<string, string>,
    bodyData?: string | Buffer,
    contentType?: string
  ): Record<string, string> {
    const result = { ...headers };

    // Only set Content-Type if not already specified by user (case-insensitive).
    if (contentType && !this.hasHeader(result, 'Content-Type')) {
      result['Content-Type'] = contentType;
    }

    // Set Content-Length if body exists and not already specified by user.
    if (bodyData && !this.hasHeader(result, 'Content-Length')) {
      result['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    return result;
  }

  private static resolveContentType(
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

  private static collectEntries(
    pairs?: KeyValuePair[] | Record<string, string>
  ): Array<[string, string]> {
    if (!pairs) {
      return [];
    }

    if (Array.isArray(pairs)) {
      return pairs.flatMap(({ key, value, enabled }) => {
        const cleanKey = key.trim();
        return enabled && cleanKey ? [[cleanKey, value.trim()]] : [];
      });
    }

    return Object.entries(pairs).flatMap(([key, value]) => {
      const cleanKey = key.trim();
      return cleanKey ? [[cleanKey, value.trim()]] : [];
    });
  }

  public static hasHeader(
    headers: Record<string, string>,
    headerName: string
  ): boolean {
    const expected = headerName.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === expected);
  }
}

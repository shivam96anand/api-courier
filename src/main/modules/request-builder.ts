/**
 * Request building utilities
 */

import { ApiRequest, KeyValuePair } from '../../shared/types';
import { URL } from 'url';

export class RequestBuilder {
  public static buildUrlWithParams(
    baseUrl: string,
    params?: KeyValuePair[] | Record<string, string>
  ): string {
    if (!params) {
      return baseUrl;
    }

    // Convert to Record format, filtering by enabled flag
    let paramsRecord: Record<string, string>;
    if (Array.isArray(params)) {
      paramsRecord = {};
      params.forEach(({ key, value, enabled }) => {
        if (enabled && key.trim() && value.trim()) {
          paramsRecord[key.trim()] = value.trim();
        }
      });
    } else {
      paramsRecord = params;
    }

    if (Object.keys(paramsRecord).length === 0) {
      return baseUrl;
    }

    const urlObj = new URL(baseUrl);
    Object.entries(paramsRecord).forEach(([key, value]) => {
      if (key.trim() && value.trim()) {
        urlObj.searchParams.set(key.trim(), value.trim());
      }
    });

    return urlObj.toString();
  }

  public static buildHeaders(request: ApiRequest): Record<string, string> {
    const cleanHeaders: Record<string, string> = {};

    // Add user-specified headers, handling both formats
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

    // Add OAuth Authorization header if applicable
    if (
      request.auth?.type === 'oauth2' &&
      request.auth.config.accessToken
    ) {
      const headerPrefix = request.auth.config.headerPrefix || 'Bearer';
      cleanHeaders['Authorization'] =
        `${headerPrefix} ${request.auth.config.accessToken}`;
    }

    return cleanHeaders;
  }

  public static buildBody(request: ApiRequest): {
    bodyData?: string | Buffer;
    contentType?: string;
  } {
    if (!request.body || request.body.type === 'none') {
      return {};
    }

    let bodyData: string | Buffer | undefined;
    let contentType: string | undefined;

    if (request.body.type === 'json') {
      bodyData = request.body.content;
      contentType = 'application/json';
    } else if (request.body.type === 'raw') {
      bodyData = request.body.content;
    } else if (request.body.type === 'form-urlencoded') {
      bodyData = request.body.content;
      contentType = 'application/x-www-form-urlencoded';
    }

    return { bodyData, contentType };
  }

  public static addDefaultHeaders(
    headers: Record<string, string>,
    bodyData?: string | Buffer,
    contentType?: string
  ): Record<string, string> {
    const result = { ...headers };

    // Only set Content-Type if not already specified by user
    if (
      contentType &&
      !result['Content-Type'] &&
      !result['content-type']
    ) {
      result['Content-Type'] = contentType;
    }

    // Set Content-Length if body exists
    if (
      bodyData &&
      !result['Content-Length'] &&
      !result['content-length']
    ) {
      result['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    return result;
  }
}

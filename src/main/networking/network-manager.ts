import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { RequestBody, FormDataEntry, BinaryBody, KeyValuePair } from '../../shared/types';

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  finalUrl: string;
  redirectChain: string[];
}

export interface RequestOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: RequestBody;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  rejectUnauthorized?: boolean;
}

/**
 * Manages HTTP requests and responses
 */
export class NetworkManager {
  private activeRequests: Map<string, http.ClientRequest> = new Map();

  /**
   * Execute an HTTP request
   */
  public async executeRequest(
    requestId: string,
    options: RequestOptions
  ): Promise<HTTPResponse> {
    const startTime = Date.now();
    const redirectChain: string[] = [];
    let currentUrl = options.url;
    let redirectCount = 0;
    const maxRedirects = options.maxRedirects || 10;

    return new Promise((resolve, reject) => {
      const makeRequest = (requestUrl: string): void => {
        const parsedUrl = url.parse(requestUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const requestModule = isHttps ? https : http;

        const requestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.path,
          method: options.method,
          headers: {
            ...options.headers,
            'User-Agent': 'API-Courier/1.0',
          },
          timeout: options.timeout || 30000,
          rejectUnauthorized: options.rejectUnauthorized !== false,
        };

        const req = requestModule.request(requestOptions, (res) => {
          // Handle redirects
          if (options.followRedirects && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            const location = res.headers.location;
            if (location && redirectCount < maxRedirects) {
              redirectChain.push(currentUrl);
              currentUrl = url.resolve(currentUrl, location);
              redirectCount++;
              makeRequest(currentUrl);
              return;
            }
          }

          let body = '';
          let bodySize = 0;

          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            bodySize += chunk.length;
          });

          res.on('end', () => {
            const endTime = Date.now();
            const response: HTTPResponse = {
              status: res.statusCode || 0,
              statusText: res.statusMessage || '',
              headers: this.normalizeHeaders(res.headers),
              body,
              time: endTime - startTime,
              size: bodySize,
              finalUrl: currentUrl,
              redirectChain,
            };

            this.activeRequests.delete(requestId);
            resolve(response);
          });

          res.on('error', (error) => {
            this.activeRequests.delete(requestId);
            reject(error);
          });
        });

        req.on('error', (error) => {
          this.activeRequests.delete(requestId);
          reject(error);
        });

        req.on('timeout', () => {
          this.activeRequests.delete(requestId);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.on('close', () => {
          this.activeRequests.delete(requestId);
        });

        // Store request reference for potential cancellation
        this.activeRequests.set(requestId, req);

        // Send body if present
        if (options.body) {
          const bodyData = this.buildRequestBody(options.body, requestOptions.headers as Record<string, string>);
          // Update headers with any changes from body builder
          Object.assign(requestOptions.headers, bodyData.headers);
          
          if (bodyData.body) {
            if (Buffer.isBuffer(bodyData.body)) {
              req.write(bodyData.body);
            } else {
              req.write(bodyData.body);
            }
          }
        }

        req.end();
      };

      makeRequest(currentUrl);
    });
  }

  /**
   * Cancel an active request
   */
  public cancelRequest(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.destroy();
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Get list of active request IDs
   */
  public getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  /**
   * Normalize response headers to consistent format
   */
  private normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const normalized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalized[key] = value;
      } else if (Array.isArray(value)) {
        normalized[key] = value.join(', ');
      } else if (value !== undefined) {
        normalized[key] = String(value);
      }
    }

    return normalized;
  }

  /**
   * Build request body based on content type
   */
  public buildRequestBody(
    requestBody: RequestBody,
    headers: Record<string, string>
  ): { body: Buffer | string; headers: Record<string, string> } {
    const updatedHeaders = { ...headers };

    switch (requestBody.type) {
      case 'json':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'application/json';
        }
        return { 
          body: requestBody.raw || '', 
          headers: updatedHeaders 
        };

      case 'xml':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'application/xml';
        }
        return { 
          body: requestBody.raw || '', 
          headers: updatedHeaders 
        };

      case 'html':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'text/html';
        }
        return { 
          body: requestBody.raw || '', 
          headers: updatedHeaders 
        };

      case 'text':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'text/plain';
        }
        return { 
          body: requestBody.raw || '', 
          headers: updatedHeaders 
        };

      case 'javascript':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'application/javascript';
        }
        return { 
          body: requestBody.raw || '', 
          headers: updatedHeaders 
        };

      case 'urlencoded':
        if (!updatedHeaders['Content-Type']) {
          updatedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        return { 
          body: this.buildUrlencodedBody(requestBody.urlencoded || []), 
          headers: updatedHeaders 
        };

      case 'formdata':
        const formData = this.buildFormDataBody(requestBody.formdata || []);
        updatedHeaders['Content-Type'] = `multipart/form-data; boundary=${formData.boundary}`;
        return { 
          body: formData.body, 
          headers: updatedHeaders 
        };

      case 'binary':
        if (requestBody.binary && requestBody.binary.filePath) {
          const fileBuffer = readFileSync(requestBody.binary.filePath);
          if (requestBody.binary.contentType && !updatedHeaders['Content-Type']) {
            updatedHeaders['Content-Type'] = requestBody.binary.contentType;
          }
          return { body: fileBuffer, headers: updatedHeaders };
        }
        return { body: '', headers: updatedHeaders };

      case 'none':
      default:
        return { body: '', headers: updatedHeaders };
    }
  }

  /**
   * Build URL-encoded body from key-value pairs
   */
  private buildUrlencodedBody(pairs: KeyValuePair[]): string {
    const params = new URLSearchParams();
    
    pairs.forEach(pair => {
      if (pair.enabled && pair.key) {
        params.append(pair.key, pair.value || '');
      }
    });

    return params.toString();
  }

  /**
   * Build multipart/form-data body
   */
  private buildFormDataBody(entries: FormDataEntry[]): { body: Buffer; boundary: string } {
    const boundary = `----formdata-api-courier-${randomBytes(16).toString('hex')}`;
    const chunks: Buffer[] = [];

    entries.forEach(entry => {
      if (!entry.enabled || !entry.key) return;

      chunks.push(Buffer.from(`--${boundary}\r\n`));

      if (entry.type === 'file' && entry.filePath) {
        const fileName = entry.fileName || entry.filePath.split('/').pop() || 'file';
        const contentType = entry.contentType || 'application/octet-stream';
        
        chunks.push(Buffer.from(
          `Content-Disposition: form-data; name="${entry.key}"; filename="${fileName}"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`
        ));

        try {
          const fileBuffer = readFileSync(entry.filePath);
          chunks.push(fileBuffer);
        } catch (error) {
          console.warn(`Failed to read file: ${entry.filePath}`, error);
          chunks.push(Buffer.from(''));
        }
      } else {
        chunks.push(Buffer.from(
          `Content-Disposition: form-data; name="${entry.key}"\r\n\r\n`
        ));
        chunks.push(Buffer.from(entry.value || ''));
      }

      chunks.push(Buffer.from('\r\n'));
    });

    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      body: Buffer.concat(chunks),
      boundary
    };
  }

  /**
   * Validate URL format
   */
  public validateUrl(urlString: string): { valid: boolean; error?: string } {
    try {
      const parsedUrl = new URL(urlString);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }
}

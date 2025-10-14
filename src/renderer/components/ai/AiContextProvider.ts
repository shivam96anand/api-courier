import { AiContext, AiContextConfig } from '../../types/ai-types';

export class AiContextProvider {
  private context: AiContext = {};

  constructor(private config: AiContextConfig) {}

  public async getCurrentContext(): Promise<AiContext> {
    const context: AiContext = {};

    if (this.config.includeRequestData && this.context.currentRequest) {
      context.currentRequest = this.sanitizeRequestData(this.context.currentRequest);
    }

    if (this.config.includeResponseData && this.context.lastResponse) {
      context.lastResponse = this.sanitizeResponseData(this.context.lastResponse);
    }

    if (this.context.environment) {
      context.environment = this.context.environment;
    }

    if (this.context.collection) {
      context.collection = this.context.collection;
    }

    return context;
  }

  private sanitizeRequestData(request: any): any {
    const sanitized = { ...request };

    // Remove sensitive headers
    if (sanitized.headers) {
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
      sanitized.headers = { ...sanitized.headers };
      
      sensitiveHeaders.forEach(header => {
        Object.keys(sanitized.headers).forEach(key => {
          if (key.toLowerCase() === header) {
            sanitized.headers[key] = '[REDACTED]';
          }
        });
      });
    }

    // Limit body size
    if (sanitized.body && typeof sanitized.body === 'string' && sanitized.body.length > 5000) {
      sanitized.body = sanitized.body.substring(0, 5000) + '... [truncated]';
    }

    return sanitized;
  }

  private sanitizeResponseData(response: any): any {
    const sanitized = { ...response };

    // Limit response body size
    if (sanitized.body && typeof sanitized.body === 'string' && sanitized.body.length > 5000) {
      sanitized.body = sanitized.body.substring(0, 5000) + '... [truncated]';
    }

    // Remove potentially sensitive response headers
    if (sanitized.headers) {
      const sensitiveHeaders = ['set-cookie', 'authorization'];
      sanitized.headers = { ...sanitized.headers };
      
      sensitiveHeaders.forEach(header => {
        Object.keys(sanitized.headers).forEach(key => {
          if (key.toLowerCase() === header) {
            sanitized.headers[key] = '[REDACTED]';
          }
        });
      });
    }

    return sanitized;
  }

  public setCurrentRequest(request: any): void {
    if (this.config.includeRequestData) {
      this.context.currentRequest = request;
    }
  }

  public setLastResponse(response: any): void {
    if (this.config.includeResponseData) {
      this.context.lastResponse = response;
    }
  }

  public setEnvironment(environment: any): void {
    this.context.environment = environment;
  }

  public setCollection(collection: any): void {
    this.context.collection = collection;
  }

  public setRequestContext(requestCtx: any): void {
    this.context.requestCtx = requestCtx;
  }

  public setResponseContext(responseCtx: any): void {
    this.context.responseCtx = responseCtx;
  }

  public clearContext(): void {
    this.context = {};
  }

  public getContextSize(): number {
    try {
      return JSON.stringify(this.context).length;
    } catch {
      return 0;
    }
  }

  public isContextSizeExceeded(): boolean {
    return this.getContextSize() > this.config.maxContextSize;
  }

  public trimContext(): void {
    if (!this.isContextSizeExceeded()) {
      return;
    }

    // Remove less important context first
    if (this.context.environment) {
      delete this.context.environment;
    }

    if (this.isContextSizeExceeded() && this.context.collection) {
      delete this.context.collection;
    }

    // Trim response body if still too large
    if (this.isContextSizeExceeded() && this.context.lastResponse?.body) {
      const response = this.context.lastResponse;
      if (typeof response.body === 'string' && response.body.length > 1000) {
        response.body = response.body.substring(0, 1000) + '... [truncated for size]';
      }
    }

    // Trim request body if still too large
    if (this.isContextSizeExceeded() && this.context.currentRequest?.body) {
      const request = this.context.currentRequest;
      if (typeof request.body === 'string' && request.body.length > 1000) {
        request.body = request.body.substring(0, 1000) + '... [truncated for size]';
      }
    }
  }

  public destroy(): void {
    this.clearContext();
  }
}
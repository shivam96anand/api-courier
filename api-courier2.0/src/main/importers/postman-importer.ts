import { 
  Collection, 
  APIRequest, 
  PostmanCollection, 
  PostmanItem, 
  PostmanRequest,
  RequestBody,
  KeyValuePair,
  FormDataEntry,
  AuthConfig
} from '../../shared/types';

export class PostmanImporter {
  
  /**
   * Import Postman collection and convert to internal format
   */
  public importCollection(postmanData: PostmanCollection): Collection[] {
    const collections: Collection[] = [];
    
    // Create root collection
    const rootCollection: Collection = {
      id: this.generateId(),
      name: postmanData.info.name,
      description: postmanData.info.description,
      type: 'folder',
      children: []
    };

    // Process items
    if (postmanData.item) {
      rootCollection.children = this.processItems(postmanData.item, rootCollection.id);
    }

    collections.push(rootCollection);
    return collections;
  }

  /**
   * Process Postman items (folders and requests)
   */
  private processItems(items: PostmanItem[], parentId: string): Collection[] {
    return items.map(item => this.processItem(item, parentId));
  }

  /**
   * Process individual Postman item
   */
  private processItem(item: PostmanItem, parentId: string): Collection {
    const id = this.generateId();

    if (item.item) {
      // This is a folder
      return {
        id,
        name: item.name,
        description: item.description,
        parentId,
        type: 'folder',
        children: this.processItems(item.item, id)
      };
    } else if (item.request) {
      // This is a request
      const request = this.convertRequest(item, id);
      return {
        id,
        name: item.name,
        description: item.description,
        parentId,
        type: 'request',
        request
      };
    } else {
      // Fallback to folder
      return {
        id,
        name: item.name,
        description: item.description,
        parentId,
        type: 'folder',
        children: []
      };
    }
  }

  /**
   * Convert Postman request to internal format
   */
  private convertRequest(item: PostmanItem, id: string): APIRequest {
    const postmanRequest = item.request!;
    
    return {
      id,
      name: item.name,
      method: this.normalizeMethod(postmanRequest.method),
      url: this.extractUrl(postmanRequest.url),
      headers: this.convertHeaders(postmanRequest.header || []),
      params: this.extractQueryParams(postmanRequest.url),
      body: this.convertBody(postmanRequest.body),
      auth: this.convertAuth(postmanRequest.auth),
      description: item.description
    };
  }

  /**
   * Normalize HTTP method
   */
  private normalizeMethod(method: string): string {
    const normalized = method?.toUpperCase() || 'GET';
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    return validMethods.includes(normalized) ? normalized : 'GET';
  }

  /**
   * Extract URL from Postman URL object or string
   */
  private extractUrl(url: any): string {
    if (typeof url === 'string') {
      return url;
    }

    if (url && typeof url === 'object') {
      if (url.raw) {
        return url.raw;
      }

      // Build URL from parts
      let urlString = '';
      
      if (url.protocol) {
        urlString += url.protocol + '://';
      } else {
        urlString += 'https://';
      }

      if (url.host) {
        if (Array.isArray(url.host)) {
          urlString += url.host.join('.');
        } else {
          urlString += url.host;
        }
      }

      if (url.port) {
        urlString += ':' + url.port;
      }

      if (url.path) {
        if (Array.isArray(url.path)) {
          urlString += '/' + url.path.join('/');
        } else {
          urlString += '/' + url.path;
        }
      }

      return urlString;
    }

    return '';
  }

  /**
   * Extract query parameters from URL
   */
  private extractQueryParams(url: any): KeyValuePair[] {
    const params: KeyValuePair[] = [];

    if (url && typeof url === 'object' && url.query) {
      url.query.forEach((param: any) => {
        params.push({
          key: param.key || '',
          value: param.value || '',
          description: param.description || '',
          enabled: !param.disabled
        });
      });
    }

    return params;
  }

  /**
   * Convert Postman headers to internal format
   */
  private convertHeaders(headers: any[]): KeyValuePair[] {
    return headers.map(header => ({
      key: header.key || '',
      value: header.value || '',
      description: header.description || '',
      enabled: !header.disabled
    }));
  }

  /**
   * Convert Postman body to internal format
   */
  private convertBody(body: any): RequestBody {
    if (!body || !body.mode) {
      return { type: 'none' };
    }

    switch (body.mode) {
      case 'raw':
        return {
          type: this.detectRawBodyType(body.raw),
          raw: body.raw || ''
        };

      case 'urlencoded':
        return {
          type: 'urlencoded',
          urlencoded: this.convertUrlencodedBody(body.urlencoded || [])
        };

      case 'formdata':
        return {
          type: 'formdata',
          formdata: this.convertFormDataBody(body.formdata || [])
        };

      case 'file':
        return {
          type: 'binary',
          binary: body.file ? {
            filePath: body.file.src || '',
            fileName: 'file',
            size: 0
          } : undefined
        };

      default:
        return { type: 'none' };
    }
  }

  /**
   * Detect body type from raw content
   */
  private detectRawBodyType(raw: string): 'json' | 'xml' | 'html' | 'text' {
    if (!raw) return 'text';

    const trimmed = raw.trim();
    
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // Not valid JSON, continue checking
      }
    }

    if (trimmed.startsWith('<')) {
      if (trimmed.toLowerCase().includes('<!doctype html') || 
          trimmed.toLowerCase().includes('<html')) {
        return 'html';
      }
      return 'xml';
    }

    return 'text';
  }

  /**
   * Convert URL-encoded body
   */
  private convertUrlencodedBody(urlencoded: any[]): KeyValuePair[] {
    return urlencoded.map(item => ({
      key: item.key || '',
      value: item.value || '',
      description: item.description || '',
      enabled: !item.disabled
    }));
  }

  /**
   * Convert form-data body
   */
  private convertFormDataBody(formdata: any[]): FormDataEntry[] {
    return formdata.map(item => ({
      key: item.key || '',
      value: item.value || '',
      description: item.description || '',
      enabled: !item.disabled,
      type: item.type === 'file' ? 'file' : 'text',
      filePath: item.src || undefined,
      fileName: item.src ? item.src.split('/').pop() : undefined
    }));
  }

  /**
   * Convert Postman auth to internal format
   */
  private convertAuth(auth: any): AuthConfig {
    if (!auth || !auth.type) {
      return { type: 'none' };
    }

    switch (auth.type) {
      case 'basic':
        const basicAuth = this.extractAuthValues(auth.basic || []);
        return {
          type: 'basic',
          basic: {
            username: basicAuth.username || '',
            password: basicAuth.password || ''
          }
        };

      case 'bearer':
        const bearerAuth = this.extractAuthValues(auth.bearer || []);
        return {
          type: 'bearer',
          bearer: {
            token: bearerAuth.token || ''
          }
        };

      case 'apikey':
        const apiKeyAuth = this.extractAuthValues(auth.apikey || []);
        return {
          type: 'apikey',
          apiKey: {
            key: apiKeyAuth.key || '',
            value: apiKeyAuth.value || '',
            in: apiKeyAuth.in === 'query' ? 'query' : 'header'
          }
        };

      case 'oauth2':
        // OAuth2 is complex, create basic structure
        return {
          type: 'oauth2',
          oauth2: {
            grantType: 'authorization_code',
            clientId: '',
            tokenUrl: '',
            authorizationUrl: '',
            scope: '',
            access_token: '',
            token_type: 'Bearer'
          } as any
        };

      default:
        return { type: 'none' };
    }
  }

  /**
   * Extract auth values from Postman auth array format
   */
  private extractAuthValues(authArray: any[]): Record<string, string> {
    const values: Record<string, string> = {};
    
    authArray.forEach(item => {
      if (item.key && item.value) {
        values[item.key] = item.value;
      }
    });

    return values;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return 'imported_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Validate Postman collection format
   */
  public validateCollection(data: any): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid JSON data' };
    }

    if (!data.info) {
      return { valid: false, error: 'Missing collection info' };
    }

    if (!data.info.name) {
      return { valid: false, error: 'Collection name is required' };
    }

    if (!data.item || !Array.isArray(data.item)) {
      return { valid: false, error: 'Collection items must be an array' };
    }

    // Check schema version
    if (data.info.schema && !data.info.schema.includes('v2.1') && !data.info.schema.includes('v2.0')) {
      console.warn('Collection schema version might not be fully supported:', data.info.schema);
    }

    return { valid: true };
  }

  /**
   * Extract collection statistics
   */
  public getCollectionStats(data: PostmanCollection): {
    totalRequests: number;
    totalFolders: number;
    authTypes: string[];
    methods: string[];
  } {
    const stats = {
      totalRequests: 0,
      totalFolders: 0,
      authTypes: new Set<string>(),
      methods: new Set<string>()
    };

    const processItems = (items: PostmanItem[]) => {
      items.forEach(item => {
        if (item.item) {
          stats.totalFolders++;
          processItems(item.item);
        } else if (item.request) {
          stats.totalRequests++;
          if (item.request.method) {
            stats.methods.add(item.request.method.toUpperCase());
          }
          if (item.request.auth?.type) {
            stats.authTypes.add(item.request.auth.type);
          }
        }
      });
    };

    if (data.item) {
      processItems(data.item);
    }

    return {
      totalRequests: stats.totalRequests,
      totalFolders: stats.totalFolders,
      authTypes: Array.from(stats.authTypes),
      methods: Array.from(stats.methods)
    };
  }
}

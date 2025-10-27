/**
 * Postman Collection v2.0/v2.1 and Environment Importer
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import {
  generateId,
  mapHttpMethod,
  mapAuth,
  sanitizeName,
  mapVariablesArray,
} from './mappers';

interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema?: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: any;
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[]; // if folder
  request?: PostmanRequest; // if request
}

interface PostmanRequest {
  method?: string;
  url: string | PostmanUrl;
  header?: Array<{ key: string; value: string; disabled?: boolean }>;
  body?: PostmanBody;
  auth?: any;
}

interface PostmanUrl {
  raw?: string;
  host?: string[];
  path?: string[];
  query?: Array<{ key: string; value: string; disabled?: boolean }>;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>;
  formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
}

interface PostmanVariable {
  key: string;
  value: string;
  enabled?: boolean;
}

interface PostmanEnvironment {
  id?: string;
  name: string;
  values: Array<{ key: string; value: string; enabled?: boolean }>;
  _postman_variable_scope?: string;
}

/**
 * Maps a Postman collection to API Courier collections
 */
export function mapPostmanCollection(data: PostmanCollection): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(data.info.name),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Map collection-level variables to a default environment
  const environments: Environment[] = [];
  if (data.variable && data.variable.length > 0) {
    const collectionEnv: Environment = {
      id: generateId(),
      name: `${rootFolder.name} Variables`,
      variables: mapVariablesArray(data.variable),
    };
    environments.push(collectionEnv);
  }

  // Map items (folders and requests)
  if (data.item) {
    rootFolder.children = data.item.map(item => mapPostmanItem(item, rootId, data.auth));
  }

  return { rootFolder, environments };
}

/**
 * Maps a Postman item (folder or request)
 */
function mapPostmanItem(item: PostmanItem, parentId: string, collectionAuth?: any): Collection {
  const itemId = generateId();

  // Check if it's a folder or request
  if (item.item) {
    // It's a folder
    const folder: Collection = {
      id: itemId,
      name: sanitizeName(item.name),
      type: 'folder',
      parentId,
      children: item.item.map(child => mapPostmanItem(child, itemId, collectionAuth)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return folder;
  } else if (item.request) {
    // It's a request
    const request = mapPostmanRequest(item.name, item.request, collectionAuth);
    const collection: Collection = {
      id: itemId,
      name: request.name,
      type: 'request',
      parentId,
      request,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return collection;
  } else {
    // Fallback: treat as empty folder
    return {
      id: itemId,
      name: sanitizeName(item.name),
      type: 'folder',
      parentId,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Maps a Postman request to ApiRequest
 */
function mapPostmanRequest(name: string, req: PostmanRequest, collectionAuth?: any): ApiRequest {
  const method = mapHttpMethod(req.method);

  // Parse URL
  let urlString = '';
  const params: Record<string, string> = {};

  if (typeof req.url === 'string') {
    urlString = req.url;
  } else if (req.url) {
    urlString = req.url.raw || '';
    // Extract query params
    if (req.url.query) {
      req.url.query.forEach(q => {
        if (q.key && (q.disabled === undefined || q.disabled === false)) {
          params[q.key] = q.value || '';
        }
      });
    }
  }

  // Parse headers
  const headers: Record<string, string> = {};
  if (req.header) {
    req.header.forEach(h => {
      if (h.key && (h.disabled === undefined || h.disabled === false)) {
        headers[h.key] = h.value || '';
      }
    });
  }

  // Parse body
  let body: ApiRequest['body'] = { type: 'none', content: '' };

  if (req.body) {
    if (req.body.mode === 'raw') {
      // Detect if it's JSON or just raw text
      const content = req.body.raw || '';
      try {
        JSON.parse(content);
        body = { type: 'json', content };
      } catch {
        body = { type: 'raw', content };
      }
    } else if (req.body.mode === 'urlencoded') {
      const pairs: string[] = [];
      if (req.body.urlencoded) {
        req.body.urlencoded.forEach(item => {
          if (item.key && (item.disabled === undefined || item.disabled === false)) {
            pairs.push(`${encodeURIComponent(item.key)}=${encodeURIComponent(item.value || '')}`);
          }
        });
      }
      body = { type: 'form-urlencoded', content: pairs.join('&') };
    } else if (req.body.mode === 'formdata') {
      // Convert form-data to a simple string representation
      const pairs: string[] = [];
      if (req.body.formdata) {
        req.body.formdata.forEach(item => {
          if (item.key && (item.disabled === undefined || item.disabled === false)) {
            pairs.push(`${item.key}=${item.value || ''}`);
          }
        });
      }
      body = { type: 'form-data', content: pairs.join('\n') };
    }
  }

  // Parse auth (use request auth if present, otherwise collection auth)
  const authConfig = req.auth || collectionAuth;
  const auth = mapAuth(authConfig);

  return {
    id: generateId(),
    name: sanitizeName(name),
    method,
    url: urlString,
    params,
    headers,
    body,
    auth: auth.type === 'none' ? undefined : auth,
  };
}

/**
 * Maps a Postman environment to API Courier Environment
 */
export function mapPostmanEnvironment(data: PostmanEnvironment): Environment {
  const variables: Record<string, string> = {};

  if (data.values) {
    data.values.forEach(v => {
      if (v.key && (v.enabled === undefined || v.enabled === true)) {
        variables[v.key] = String(v.value || '');
      }
    });
  }

  return {
    id: generateId(),
    name: sanitizeName(data.name),
    variables,
  };
}

/**
 * Detects if JSON is a Postman collection
 */
export function isPostmanCollection(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    data.info &&
    typeof data.info.schema === 'string' &&
    data.info.schema.includes('postman')
  );
}

/**
 * Detects if JSON is a Postman environment
 */
export function isPostmanEnvironment(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    data.name &&
    Array.isArray(data.values) &&
    (data._postman_variable_scope === 'environment' || data.values.some((v: any) => v.key))
  );
}

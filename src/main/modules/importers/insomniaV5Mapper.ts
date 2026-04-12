/**
 * Insomnia V5 format mapper
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, mapAuth, sanitizeName } from './mappers';

/**
 * Maps Insomnia V5 format to Restbro format
 */
export function mapInsomniaV5Export(data: any): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const rootId = generateId();
  const environments: Environment[] = [];

  // Extract from root-level base environment
  if (data.environments && typeof data.environments === 'object') {
    const baseEnv = data.environments;
    const variables: Record<string, string> = {};

    Object.keys(baseEnv).forEach((key) => {
      if (
        key !== 'name' &&
        key !== 'meta' &&
        typeof baseEnv[key] === 'string'
      ) {
        variables[key] = baseEnv[key];
      }
    });

    if (Object.keys(variables).length > 0) {
      const envName = baseEnv.name || 'Base Environment';
      environments.push({
        id: generateId(),
        name: envName,
        variables,
      });
    }
  }

  // Map collection items
  let children: Collection[] = [];
  if (Array.isArray(data.collection)) {
    children = data.collection.map((item: any) =>
      mapV5CollectionItem(item, undefined)
    );
  }

  const rootFolder: Collection =
    children.length === 1
      ? children[0]
      : {
          id: rootId,
          name: sanitizeName(data.name || 'Imported Collection'),
          type: 'folder',
          children,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

  return { rootFolder, environments };
}

/**
 * Maps a V5 collection item (folder or request)
 */
function mapV5CollectionItem(item: any, parentId?: string): Collection {
  const itemId = generateId();

  // Check if it's a folder
  if (item.children && Array.isArray(item.children)) {
    let folderVariables: Record<string, string> | undefined;
    if (item.environment && typeof item.environment === 'object') {
      const variables: Record<string, string> = {};
      Object.keys(item.environment).forEach((key) => {
        if (typeof item.environment[key] === 'string') {
          variables[key] = item.environment[key];
        }
      });

      if (Object.keys(variables).length > 0) {
        folderVariables = variables;
      }
    }

    const folder: Collection = {
      id: itemId,
      name: sanitizeName(item.name),
      type: 'folder',
      ...(parentId && { parentId }),
      ...(folderVariables && { variables: folderVariables }),
      children: item.children.map((child: any) =>
        mapV5CollectionItem(child, itemId)
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return folder;
  } else if (item.url || item.method) {
    // It's a request
    const apiRequest = mapV5Request(item);
    const collection: Collection = {
      id: itemId,
      name: apiRequest.name,
      type: 'request',
      ...(parentId && { parentId }),
      request: apiRequest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return collection;
  } else {
    // Fallback
    return {
      id: itemId,
      name: sanitizeName(item.name || 'Unknown'),
      type: 'folder',
      ...(parentId && { parentId }),
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Maps a V5 request to ApiRequest
 */
function mapV5Request(item: any): ApiRequest {
  const method = mapHttpMethod(item.method);
  const url = convertInsomniaVariables(item.url || '');

  // Parse params
  const params: Record<string, string> = {};
  if (Array.isArray(item.parameters)) {
    item.parameters.forEach((p: any) => {
      if (p.name && (p.disabled === undefined || p.disabled === false)) {
        params[p.name] = convertInsomniaVariables(p.value || '');
      }
    });
  }

  // Parse headers
  const headers: Record<string, string> = {};
  if (Array.isArray(item.headers)) {
    item.headers.forEach((h: any) => {
      if (h.name && (h.disabled === undefined || h.disabled === false)) {
        headers[h.name] = convertInsomniaVariables(h.value || '');
      }
    });
  }

  // Parse body
  let body: ApiRequest['body'] = { type: 'none', content: '' };
  if (item.body) {
    const mimeType = item.body.mimeType || '';
    if (mimeType.includes('json') && item.body.text) {
      body = {
        type: 'json',
        content: convertInsomniaVariables(item.body.text),
      };
    } else if (mimeType.includes('form-urlencoded') && item.body.params) {
      const pairs: string[] = [];
      item.body.params.forEach((p: any) => {
        if (p.name && (p.disabled === undefined || p.disabled === false)) {
          pairs.push(`${p.name}=${convertInsomniaVariables(p.value || '')}`);
        }
      });
      body = { type: 'form-urlencoded', content: pairs.join('&') };
    } else if (mimeType.includes('multipart') && item.body.params) {
      const pairs: string[] = [];
      item.body.params.forEach((p: any) => {
        if (p.name && (p.disabled === undefined || p.disabled === false)) {
          pairs.push(`${p.name}=${convertInsomniaVariables(p.value || '')}`);
        }
      });
      body = { type: 'form-data', content: pairs.join('\n') };
    } else if (item.body.text) {
      body = {
        type: 'raw',
        content: convertInsomniaVariables(item.body.text),
      };
    }
  }

  // Parse auth
  const auth = mapAuth(item.authentication || {});

  return {
    id: generateId(),
    name: sanitizeName(item.name),
    method,
    url,
    params,
    headers,
    body,
    auth: auth.type === 'none' ? undefined : auth,
  };
}

/**
 * Convert Insomnia variables
 */
function convertInsomniaVariables(input: string): string {
  return input.replace(/{{\s*_\.(\w+)\s*}}/g, '{{$1}}');
}

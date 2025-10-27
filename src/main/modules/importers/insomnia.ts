/**
 * Insomnia Export v4+ Importer
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import {
  generateId,
  mapHttpMethod,
  mapAuth,
  sanitizeName,
} from './mappers';

interface InsomniaExport {
  __export_format: number;
  __export_date?: string;
  __export_source?: string;
  resources: InsomniaResource[];
}

type InsomniaResource =
  | InsomniaWorkspace
  | InsomniaEnvironment
  | InsomniaRequestGroup
  | InsomniaRequest;

interface InsomniaWorkspace {
  _id: string;
  _type: 'workspace';
  name: string;
  description?: string;
  scope?: string;
}

interface InsomniaEnvironment {
  _id: string;
  _type: 'environment';
  name: string;
  data: Record<string, any>;
  parentId: string;
}

interface InsomniaRequestGroup {
  _id: string;
  _type: 'request_group';
  name: string;
  parentId: string;
  environment?: Record<string, any>;
}

interface InsomniaRequest {
  _id: string;
  _type: 'request';
  name: string;
  url: string;
  method: string;
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>;
  body?: InsomniaBody;
  authentication?: any;
  parentId: string;
}

interface InsomniaBody {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value: string; disabled?: boolean }>;
}

/**
 * Maps an Insomnia export to API Courier format
 */
export function mapInsomniaExport(data: any): {
  rootFolder: Collection;
  environments: Environment[];
} {
  // Check if it's v5 format
  if (data.type && data.type.includes('insomnia') && data.collection) {
    return mapInsomniaV5Export(data);
  }

  // Otherwise, treat as v4 format
  const resources = data.resources;

  // Find workspace
  const workspace = resources.find((r: InsomniaResource) => r._type === 'workspace') as InsomniaWorkspace | undefined;

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: workspace ? sanitizeName(workspace.name) : 'Imported Workspace',
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Map environments
  const environments: Environment[] = [];
  const envResources = resources.filter((r: InsomniaResource) => r._type === 'environment') as InsomniaEnvironment[];

  envResources.forEach(env => {
    // Convert Insomnia {{_.var}} syntax to {{var}}
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(env.data)) {
      variables[key] = String(value);
    }

    environments.push({
      id: generateId(),
      name: sanitizeName(env.name),
      variables,
    });
  });

  // Build hierarchy map
  const itemMap = new Map<string, any>();
  resources.forEach((r: InsomniaResource) => {
    itemMap.set(r._id, r);
  });

  // Find top-level items (those whose parentId is the workspace)
  const workspaceId = workspace?._id;
  const topLevelIds = resources
    .filter((r: InsomniaResource) =>
      (r._type === 'request_group' || r._type === 'request') &&
      (r as any).parentId === workspaceId
    )
    .map((r: InsomniaResource) => r._id);

  // Map each top-level item
  rootFolder.children = topLevelIds.map((id: string) => mapInsomniaResource(itemMap.get(id)!, itemMap, rootId));

  return { rootFolder, environments };
}

/**
 * Recursively maps Insomnia resource (request_group or request)
 */
function mapInsomniaResource(
  resource: InsomniaResource,
  itemMap: Map<string, any>,
  parentId: string
): Collection {
  const itemId = generateId();

  if (resource._type === 'request_group') {
    // It's a folder
    const group = resource as InsomniaRequestGroup;

    // Find children
    const childIds = Array.from(itemMap.values())
      .filter(r =>
        (r._type === 'request_group' || r._type === 'request') &&
        r.parentId === group._id
      )
      .map(r => r._id);

    const folder: Collection = {
      id: itemId,
      name: sanitizeName(group.name),
      type: 'folder',
      parentId,
      children: childIds.map(id => mapInsomniaResource(itemMap.get(id)!, itemMap, itemId)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return folder;
  } else if (resource._type === 'request') {
    // It's a request
    const req = resource as InsomniaRequest;
    const apiRequest = mapInsomniaRequest(req);

    const collection: Collection = {
      id: itemId,
      name: apiRequest.name,
      type: 'request',
      parentId,
      request: apiRequest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return collection;
  } else {
    // Fallback
    return {
      id: itemId,
      name: 'Unknown',
      type: 'folder',
      parentId,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Maps an Insomnia request to ApiRequest
 */
function mapInsomniaRequest(req: InsomniaRequest): ApiRequest {
  const method = mapHttpMethod(req.method);

  // Convert Insomnia variable syntax {{ _.varName }} to {{varName}}
  let url = convertInsomniaVariables(req.url);

  // Parse params
  const params: Record<string, string> = {};
  if (req.parameters) {
    req.parameters.forEach(p => {
      if (p.name && (p.disabled === undefined || p.disabled === false)) {
        params[p.name] = convertInsomniaVariables(p.value || '');
      }
    });
  }

  // Parse headers
  const headers: Record<string, string> = {};
  if (req.headers) {
    req.headers.forEach(h => {
      if (h.name && (h.disabled === undefined || h.disabled === false)) {
        headers[h.name] = convertInsomniaVariables(h.value || '');
      }
    });
  }

  // Parse body
  let body: ApiRequest['body'] = { type: 'none', content: '' };

  if (req.body) {
    const mimeType = req.body.mimeType || '';

    if (mimeType.includes('json') && req.body.text) {
      body = {
        type: 'json',
        content: convertInsomniaVariables(req.body.text),
      };
    } else if (mimeType.includes('x-www-form-urlencoded') && req.body.params) {
      const pairs: string[] = [];
      req.body.params.forEach(p => {
        if (p.name && (p.disabled === undefined || p.disabled === false)) {
          pairs.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(convertInsomniaVariables(p.value || ''))}`);
        }
      });
      body = { type: 'form-urlencoded', content: pairs.join('&') };
    } else if (mimeType.includes('form-data') && req.body.params) {
      const pairs: string[] = [];
      req.body.params.forEach(p => {
        if (p.name && (p.disabled === undefined || p.disabled === false)) {
          pairs.push(`${p.name}=${convertInsomniaVariables(p.value || '')}`);
        }
      });
      body = { type: 'form-data', content: pairs.join('\n') };
    } else if (req.body.text) {
      body = {
        type: 'raw',
        content: convertInsomniaVariables(req.body.text),
      };
    }
  }

  // Parse auth
  const auth = mapAuth(req.authentication || {});

  return {
    id: generateId(),
    name: sanitizeName(req.name),
    method,
    url,
    params,
    headers,
    body,
    auth: auth.type === 'none' ? undefined : auth,
  };
}

/**
 * Converts Insomnia variable syntax {{_.varName}} to {{varName}}
 * Also handles other Insomnia template functions by preserving them
 */
function convertInsomniaVariables(input: string): string {
  // Replace {{ _.varName }} with {{varName}}
  let output = input.replace(/{{\s*_\.(\w+)\s*}}/g, '{{$1}}');

  // Insomnia template functions like {{ uuid }}, {{ timestamp }} - convert to our syntax
  // For now, keep them as-is with a note that they're unsupported
  // In a production app, you might want to convert these or add a note field

  return output;
}

/**
 * Maps Insomnia v5 format to API Courier format
 */
function mapInsomniaV5Export(data: any): {
  rootFolder: Collection;
  environments: Environment[];
} {
  // For v5 format, we don't create a wrapper root folder
  // Instead, we create a container that holds the direct children
  const rootId = generateId();

  // Only extract workspace-level environments (not folder-embedded ones)
  const environments: Environment[] = [];

  // Extract from root-level base environment only
  if (data.environments && typeof data.environments === 'object') {
    const baseEnv = data.environments;
    const variables: Record<string, string> = {};

    // Look for variables in the base environment structure
    Object.keys(baseEnv).forEach(key => {
      if (key !== 'name' && key !== 'meta' && typeof baseEnv[key] === 'string') {
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

  // NOTE: Folder-embedded environments will be stored as folder.variables during collection mapping

  // Map collection items - these will be the actual top-level folders/requests
  let children: Collection[] = [];
  if (Array.isArray(data.collection)) {
    children = data.collection.map((item: any) =>
      mapV5CollectionItem(item, undefined) // No parentId - these are top-level
    );
  }

  // If we only have one child, return it directly
  // Otherwise, wrap them in a container (but don't add the container to collections)
  const rootFolder: Collection = children.length === 1 ? children[0] : {
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
 * Maps a v5 collection item (folder or request)
 */
function mapV5CollectionItem(item: any, parentId?: string): Collection {
  const itemId = generateId();

  // Check if it has children (folder) or is a request
  if (item.children && Array.isArray(item.children)) {
    // It's a folder

    // Extract folder-scoped environment variables
    let folderVariables: Record<string, string> | undefined;
    if (item.environment && typeof item.environment === 'object') {
      const variables: Record<string, string> = {};
      Object.keys(item.environment).forEach(key => {
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
      children: item.children.map((child: any) => mapV5CollectionItem(child, itemId)),
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
    // Fallback to folder
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
 * Maps a v5 request to ApiRequest
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
    } else if (item.body.text) {
      body = {
        type: 'raw',
        content: convertInsomniaVariables(item.body.text),
      };
    }
  }

  // Parse auth
  let auth: ApiRequest['auth'] = undefined;
  if (item.authentication && item.authentication.type) {
    const mappedAuth = mapAuth(item.authentication);
    if (mappedAuth.type !== 'none') {
      auth = mappedAuth;
    }
  }

  return {
    id: generateId(),
    name: sanitizeName(item.name),
    method,
    url,
    params,
    headers,
    body,
    auth,
  };
}

/**
 * Detects if JSON is an Insomnia export
 */
export function isInsomniaExport(data: any): boolean {
  // v4 format with resources array
  const isV4 = data &&
    typeof data === 'object' &&
    typeof data.__export_format === 'number' &&
    Array.isArray(data.resources);

  // v5 format with type and collection
  const isV5 = data &&
    typeof data === 'object' &&
    typeof data.type === 'string' &&
    data.type.includes('insomnia') &&
    (Array.isArray(data.collection) || typeof data.collection === 'object');

  return isV4 || isV5;
}

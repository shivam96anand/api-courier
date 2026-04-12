/**
 * Insomnia V4 format mapper
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import {
  generateId,
  mapHttpMethod,
  mapAuth,
  sanitizeName,
} from './mappers';
import {
  InsomniaResource,
  InsomniaWorkspace,
  InsomniaEnvironment,
  InsomniaRequestGroup,
  InsomniaRequest,
} from './insomniaTypes';

/**
 * Maps an Insomnia V4 export to Restbro format
 */
export function mapInsomniaV4Export(resources: InsomniaResource[]): {
  rootFolder: Collection;
  environments: Environment[];
} {
  // Find workspace
  const workspace = resources.find(
    (r) => r._type === 'workspace'
  ) as InsomniaWorkspace | undefined;

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
  const envResources = resources.filter(
    (r) => r._type === 'environment'
  ) as InsomniaEnvironment[];

  envResources.forEach((env) => {
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

  // Find top-level items
  const workspaceId = workspace?._id;
  const topLevelIds = resources
    .filter(
      (r: InsomniaResource) =>
        (r._type === 'request_group' || r._type === 'request') &&
        (r as any).parentId === workspaceId
    )
    .map((r: InsomniaResource) => r._id);

  // Map each top-level item
  rootFolder.children = topLevelIds.map((id: string) =>
    mapInsomniaResource(itemMap.get(id)!, itemMap, rootId)
  );

  return { rootFolder, environments };
}

/**
 * Recursively maps Insomnia resource
 */
function mapInsomniaResource(
  resource: InsomniaResource,
  itemMap: Map<string, any>,
  parentId: string
): Collection {
  const itemId = generateId();

  if (resource._type === 'request_group') {
    const group = resource as InsomniaRequestGroup;

    // Find children
    const childrenIds = Array.from(itemMap.values())
      .filter((r: InsomniaResource) => (r as any).parentId === group._id)
      .map((r: InsomniaResource) => r._id);

    return {
      id: itemId,
      name: sanitizeName(group.name),
      type: 'folder',
      parentId,
      children: childrenIds.map((cid: string) =>
        mapInsomniaResource(itemMap.get(cid)!, itemMap, itemId)
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else if (resource._type === 'request') {
    const req = resource as InsomniaRequest;
    const apiReq = mapV4Request(req);

    return {
      id: itemId,
      name: sanitizeName(req.name),
      type: 'request',
      parentId,
      request: apiReq,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Fallback
  return {
    id: itemId,
    name: sanitizeName((resource as any).name || 'Unknown'),
    type: 'folder',
    parentId,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Maps a V4 request to ApiRequest
 */
function mapV4Request(req: InsomniaRequest): ApiRequest {
  const method = mapHttpMethod(req.method);
  const url = convertInsomniaVariables(req.url || '');

  // Parse params
  const params: Record<string, string> = {};
  if (Array.isArray(req.parameters)) {
    req.parameters.forEach((p) => {
      if (p.name && !p.disabled) {
        params[p.name] = convertInsomniaVariables(p.value || '');
      }
    });
  }

  // Parse headers
  const headers: Record<string, string> = {};
  if (Array.isArray(req.headers)) {
    req.headers.forEach((h) => {
      if (h.name && !h.disabled) {
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
    } else if (mimeType.includes('form-urlencoded') && req.body.params) {
      const pairs: string[] = [];
      req.body.params.forEach((p) => {
        if (p.name && !p.disabled) {
          pairs.push(`${p.name}=${convertInsomniaVariables(p.value || '')}`);
        }
      });
      body = { type: 'form-urlencoded', content: pairs.join('&') };
    } else if (mimeType.includes('multipart') && req.body.params) {
      const pairs: string[] = [];
      req.body.params.forEach((p) => {
        if (p.name && !p.disabled) {
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
  const auth = req.authentication ? mapAuth(req.authentication) : undefined;

  return {
    id: generateId(),
    name: sanitizeName(req.name),
    method,
    url,
    params,
    headers,
    body,
    auth,
  };
}

/**
 * Convert Insomnia {{_. variables
 */
function convertInsomniaVariables(text: string): string {
  return text.replace(/\{\{\s*_\.([^}]+)\}\}/g, '{{$1}}');
}

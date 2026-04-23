/**
 * Hoppscotch Collection and Environment Importer
 *
 * Hoppscotch exports are JSON. The two shapes we accept:
 *
 * 1) Collections: an array of "root collections" OR a single root collection
 *    object. Each collection has shape:
 *    {
 *      v: 1 | 2 | 3 | ...,
 *      name: string,
 *      folders: HoppCollection[],
 *      requests: HoppRequest[],
 *      auth?: HoppAuth,
 *      headers?: HoppKV[]
 *    }
 *
 * 2) Environments: an array of environments OR a single environment object.
 *    Each environment has shape:
 *    {
 *      v?: number,
 *      name: string,
 *      variables: Array<{ key: string; value?: string; secret?: boolean }>
 *    }
 *
 * Detection is intentionally conservative — Hoppscotch JSON has no schema URL
 * to anchor on, so we look for a combination of keys not seen in Postman or
 * Insomnia exports (e.g. `endpoint` on requests, `folders` + `requests` on
 * collections).
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

interface HoppKV {
  key: string;
  value?: string;
  active?: boolean;
  description?: string;
}

interface HoppAuth {
  authType?: string;
  authActive?: boolean;
  // basic
  username?: string;
  password?: string;
  // bearer
  token?: string;
  // api-key
  key?: string;
  value?: string;
  addTo?: string; // 'HEADERS' | 'QUERY_PARAMS'
  // oauth2 (varies between versions)
  grantTypeInfo?: {
    grantType?: string;
    authEndpoint?: string;
    tokenEndpoint?: string;
    clientID?: string;
    clientSecret?: string;
    scopes?: string;
    token?: string;
    refreshToken?: string;
  };
}

interface HoppBody {
  contentType?: string | null;
  body?: string | HoppKV[] | null;
}

interface HoppRequest {
  v?: number | string;
  name?: string;
  method?: string;
  endpoint?: string;
  url?: string; // older exports used `url`
  params?: HoppKV[];
  headers?: HoppKV[];
  body?: HoppBody | null;
  auth?: HoppAuth;
}

interface HoppCollection {
  v?: number | string;
  name?: string;
  folders?: HoppCollection[];
  requests?: HoppRequest[];
  auth?: HoppAuth;
  headers?: HoppKV[];
}

interface HoppEnvironment {
  v?: number | string;
  name?: string;
  variables?: Array<{ key?: string; value?: unknown; secret?: boolean }>;
}

/** True when `data` looks like a Hoppscotch request object. */
function looksLikeHoppRequest(item: any): boolean {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.name === 'string' &&
    (typeof item.endpoint === 'string' || typeof item.url === 'string') &&
    typeof item.method === 'string'
  );
}

/** True when `data` looks like a Hoppscotch collection object. */
function looksLikeHoppCollection(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.name !== 'string') return false;
  // Must have at least one of the Hoppscotch-only structural fields.
  const hasFolders = Array.isArray(item.folders);
  const hasRequests = Array.isArray(item.requests);
  if (!hasFolders && !hasRequests) return false;
  // Reject if it also looks like Postman (has `info.schema`) or Insomnia.
  if (item.info && typeof item.info.schema === 'string') return false;
  if (item._type || item.__export_format) return false;
  // Verify nested requests look right (when present), to avoid false positives.
  if (hasRequests && item.requests.length > 0) {
    return item.requests.every((r: any) => looksLikeHoppRequest(r));
  }
  return true;
}

/** True when `data` looks like a Hoppscotch environment object. */
function looksLikeHoppEnvironment(item: any): boolean {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.name === 'string' &&
    Array.isArray(item.variables) &&
    // Distinguish from Postman environments which use `values`.
    !Array.isArray((item as any).values) &&
    (item.variables.length === 0 ||
      item.variables.every(
        (v: any) => v && typeof v === 'object' && typeof v.key === 'string'
      ))
  );
}

/**
 * Detects Hoppscotch collection export (single object or array).
 */
export function isHoppscotchCollection(data: any): boolean {
  if (Array.isArray(data)) {
    return data.length > 0 && data.every((c) => looksLikeHoppCollection(c));
  }
  return looksLikeHoppCollection(data);
}

/**
 * Detects Hoppscotch environment export (single object or array).
 */
export function isHoppscotchEnvironment(data: any): boolean {
  if (Array.isArray(data)) {
    return data.length > 0 && data.every((e) => looksLikeHoppEnvironment(e));
  }
  return looksLikeHoppEnvironment(data);
}

/** Convert Hoppscotch key/value array to Restbro Record (skips inactive). */
function mapHoppKVs(items?: HoppKV[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (!item || typeof item.key !== 'string' || item.key.length === 0)
      continue;
    if (item.active === false) continue;
    out[item.key] = item.value == null ? '' : String(item.value);
  }
  return out;
}

/** Map Hoppscotch auth to Restbro auth shape. */
function mapHoppAuth(auth?: HoppAuth): ApiRequest['auth'] {
  if (!auth || !auth.authType || auth.authType === 'none') return undefined;
  if (auth.authActive === false) return undefined;

  const authType = String(auth.authType).toLowerCase();

  if (authType === 'basic') {
    return {
      type: 'basic',
      config: {
        username: auth.username ?? '',
        password: auth.password ?? '',
      },
    };
  }

  if (authType === 'bearer') {
    return {
      type: 'bearer',
      config: { token: auth.token ?? '' },
    };
  }

  if (authType === 'api-key' || authType === 'apikey') {
    const location =
      auth.addTo === 'QUERY_PARAMS' ? 'query' : auth.addTo ? 'header' : '';
    const config: Record<string, string> = {
      key: auth.key ?? '',
      value: auth.value ?? '',
    };
    if (location) {
      config.location = location;
      config.in = location;
    }
    return { type: 'api-key', config };
  }

  if (authType === 'oauth-2' || authType === 'oauth2') {
    const info = auth.grantTypeInfo ?? {};
    const config: Record<string, string> = {};
    if (info.grantType) config.grantType = String(info.grantType);
    if (info.authEndpoint) config.authUrl = String(info.authEndpoint);
    if (info.tokenEndpoint) {
      config.tokenUrl = String(info.tokenEndpoint);
      config.accessTokenUrl = String(info.tokenEndpoint);
    }
    if (info.clientID) config.clientId = String(info.clientID);
    if (info.clientSecret) config.clientSecret = String(info.clientSecret);
    if (info.scopes) config.scope = String(info.scopes);
    if (info.token) config.accessToken = String(info.token);
    if (info.refreshToken) config.refreshToken = String(info.refreshToken);
    return { type: 'oauth2', config };
  }

  return undefined;
}

/** Map a Hoppscotch request body to Restbro body. */
function mapHoppBody(body?: HoppBody | null): ApiRequest['body'] {
  if (!body || (body.body == null && !body.contentType)) {
    return { type: 'none', content: '' };
  }

  const contentType = (body.contentType ?? '').toLowerCase();

  // urlencoded — body is array of {key,value,active}
  if (
    contentType.includes('x-www-form-urlencoded') &&
    Array.isArray(body.body)
  ) {
    const pairs: string[] = [];
    for (const item of body.body) {
      if (!item || !item.key || item.active === false) continue;
      pairs.push(
        `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value ?? '')}`
      );
    }
    return { type: 'form-urlencoded', content: pairs.join('&') };
  }

  // multipart — body is array of {key,value,active}
  if (contentType.includes('multipart/form-data') && Array.isArray(body.body)) {
    const lines: string[] = [];
    for (const item of body.body) {
      if (!item || !item.key || item.active === false) continue;
      lines.push(`${item.key}=${item.value ?? ''}`);
    }
    return { type: 'form-data', content: lines.join('\n') };
  }

  // raw / json / xml / text — body is a string
  if (typeof body.body === 'string') {
    if (contentType.includes('json')) {
      return { type: 'json', content: body.body };
    }
    return { type: 'raw', content: body.body };
  }

  return { type: 'none', content: '' };
}

/** Map one Hoppscotch request to a Restbro Collection node. */
function mapHoppRequestNode(req: HoppRequest, parentId: string): Collection {
  const id = generateId();
  const apiRequest: ApiRequest = {
    id: generateId(),
    name: sanitizeName(req.name),
    method: mapHttpMethod(req.method),
    url: req.endpoint ?? req.url ?? '',
    params: mapHoppKVs(req.params),
    headers: mapHoppKVs(req.headers),
    body: mapHoppBody(req.body),
    auth: mapHoppAuth(req.auth),
  };

  return {
    id,
    name: apiRequest.name,
    type: 'request',
    parentId,
    request: apiRequest,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Map one Hoppscotch collection (folder) to a Restbro Collection node. */
function mapHoppCollectionNode(
  coll: HoppCollection,
  parentId: string
): Collection {
  const id = generateId();
  const folder: Collection = {
    id,
    name: sanitizeName(coll.name),
    type: 'folder',
    parentId,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const children: Collection[] = [];
  if (Array.isArray(coll.folders)) {
    for (const sub of coll.folders) {
      children.push(mapHoppCollectionNode(sub, id));
    }
  }
  if (Array.isArray(coll.requests)) {
    for (const r of coll.requests) {
      children.push(mapHoppRequestNode(r, id));
    }
  }
  folder.children = children;
  return folder;
}

/**
 * Map a Hoppscotch collection export to Restbro format.
 * Accepts a single root collection or an array of root collections.
 */
export function mapHoppscotchCollection(data: any): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const roots: HoppCollection[] = Array.isArray(data) ? data : [data];

  // If there is exactly one root collection, use it as the root folder.
  if (roots.length === 1) {
    return {
      rootFolder: mapHoppCollectionNode(roots[0], ''),
      environments: [],
    };
  }

  // Otherwise wrap multiple roots under a synthetic "Hoppscotch Import" folder.
  const wrapperId = generateId();
  const wrapper: Collection = {
    id: wrapperId,
    name: 'Hoppscotch Import',
    type: 'folder',
    children: roots.map((r) => mapHoppCollectionNode(r, wrapperId)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { rootFolder: wrapper, environments: [] };
}

/** Map a Hoppscotch environment export to Restbro Environment[]. */
export function mapHoppscotchEnvironment(data: any): Environment[] {
  const items: HoppEnvironment[] = Array.isArray(data) ? data : [data];
  return items.map((env) => {
    const variables: Record<string, string> = {};
    if (Array.isArray(env.variables)) {
      for (const v of env.variables) {
        if (!v || typeof v.key !== 'string' || v.key.length === 0) continue;
        variables[v.key] = v.value == null ? '' : String(v.value);
      }
    }
    return {
      id: generateId(),
      name: sanitizeName(env.name),
      variables,
    };
  });
}

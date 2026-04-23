/**
 * Thunder Client (VS Code extension) importer.
 *
 * Thunder Client exports two distinct JSON shapes:
 *
 *  - **Collection** (`thunder-collection_*.json`):
 *      { clientName: 'Thunder Client', collectionName, folders[], requests[] }
 *      Folders and requests both carry a `containerId` linking each request
 *      to its parent folder; top-level items have an empty `containerId`.
 *
 *  - **Environment** (`thunder-environment_*.json`):
 *      { clientName: 'Thunder Client', name, data: [{ name, value }] }
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

interface ThunderHeader {
  name: string;
  value: string;
  isDisabled?: boolean;
}

interface ThunderParam {
  name: string;
  value: string;
  isPath?: boolean;
  isDisabled?: boolean;
}

interface ThunderBody {
  type?: string; // 'json' | 'text' | 'xml' | 'formencoded' | 'formdata' | 'graphql' | 'none'
  raw?: string;
  form?: ThunderParam[];
  files?: any[];
  graphql?: { query?: string; variables?: string };
}

interface ThunderAuth {
  type?: string; // 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2'
  basic?: { username?: string; password?: string };
  bearer?: string;
  apikey?: { key?: string; value?: string; addTo?: string };
  oauth2?: {
    grantType?: string;
    accessTokenUrl?: string;
    authUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    accessToken?: string;
    refreshToken?: string;
  };
}

interface ThunderRequest {
  _id?: string;
  colId?: string;
  containerId?: string;
  name?: string;
  url?: string;
  method?: string;
  sortNum?: number;
  headers?: ThunderHeader[];
  params?: ThunderParam[];
  body?: ThunderBody;
  auth?: ThunderAuth;
}

interface ThunderFolder {
  _id?: string;
  containerId?: string;
  name?: string;
  sortNum?: number;
}

interface ThunderCollectionFile {
  clientName?: string;
  collectionName?: string;
  folders?: ThunderFolder[];
  requests?: ThunderRequest[];
  auth?: ThunderAuth;
}

interface ThunderEnvironmentFile {
  clientName?: string;
  name?: string;
  data?: Array<{ name?: string; value?: string }>;
}

/** Detects a Thunder Client collection export. */
export function isThunderClientCollection(data: any): boolean {
  return Boolean(
    data &&
      typeof data === 'object' &&
      data.clientName === 'Thunder Client' &&
      Array.isArray(data.requests)
  );
}

/** Detects a Thunder Client environment export. */
export function isThunderClientEnvironment(data: any): boolean {
  return Boolean(
    data &&
      typeof data === 'object' &&
      data.clientName === 'Thunder Client' &&
      Array.isArray(data.data) &&
      typeof data.name === 'string'
  );
}

function tcKvToRecord(
  items?: ThunderHeader[] | ThunderParam[]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(items)) return out;
  for (const it of items as Array<ThunderHeader | ThunderParam>) {
    if (!it || !it.name) continue;
    if ((it as ThunderHeader).isDisabled) continue;
    if ((it as ThunderParam).isPath) continue; // path params handled via URL substitution
    out[it.name] = it.value ?? '';
  }
  return out;
}

function tcExtractPathVars(params?: ThunderParam[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(params)) return out;
  for (const p of params) {
    if (p?.isPath && p.name) out[p.name] = p.value ?? '';
  }
  return out;
}

function tcMapBody(body?: ThunderBody): ApiRequest['body'] {
  if (!body || !body.type || body.type === 'none')
    return { type: 'none', content: '' };
  const t = body.type.toLowerCase();
  if (t === 'json') return { type: 'json', content: body.raw ?? '' };
  if (t === 'text') return { type: 'raw', content: body.raw ?? '' };
  if (t === 'xml')
    return { type: 'raw', content: body.raw ?? '', format: 'xml' };
  if (t === 'formencoded') {
    const pairs = (body.form ?? [])
      .filter((p) => !p.isDisabled && p.name)
      .map(
        (p) =>
          `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value ?? '')}`
      )
      .join('&');
    return { type: 'form-urlencoded', content: pairs };
  }
  if (t === 'formdata') {
    const lines = (body.form ?? [])
      .filter((p) => !p.isDisabled && p.name)
      .map((p) => `${p.name}=${p.value ?? ''}`)
      .join('\n');
    return { type: 'form-data', content: lines };
  }
  if (t === 'graphql') {
    const payload = JSON.stringify({
      query: body.graphql?.query ?? '',
      variables: body.graphql?.variables
        ? safeJsonParse(body.graphql.variables)
        : {},
    });
    return { type: 'json', content: payload };
  }
  return { type: 'none', content: '' };
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function tcMapAuth(auth?: ThunderAuth): ApiRequest['auth'] {
  if (!auth || !auth.type || auth.type === 'none') return undefined;
  const t = auth.type.toLowerCase();
  if (t === 'basic') {
    return {
      type: 'basic',
      config: {
        username: auth.basic?.username ?? '',
        password: auth.basic?.password ?? '',
      },
    };
  }
  if (t === 'bearer') {
    return { type: 'bearer', config: { token: auth.bearer ?? '' } };
  }
  if (t === 'apikey') {
    const location =
      auth.apikey?.addTo?.toLowerCase() === 'queryparams' ? 'query' : 'header';
    return {
      type: 'api-key',
      config: {
        key: auth.apikey?.key ?? '',
        value: auth.apikey?.value ?? '',
        location,
        in: location,
      },
    };
  }
  if (t === 'oauth2') {
    const o = auth.oauth2 ?? {};
    const config: Record<string, string> = {};
    if (o.grantType) config.grantType = o.grantType;
    if (o.authUrl) config.authUrl = o.authUrl;
    if (o.accessTokenUrl) {
      config.tokenUrl = o.accessTokenUrl;
      config.accessTokenUrl = o.accessTokenUrl;
    }
    if (o.clientId) config.clientId = o.clientId;
    if (o.clientSecret) config.clientSecret = o.clientSecret;
    if (o.scope) config.scope = o.scope;
    if (o.accessToken) config.accessToken = o.accessToken;
    if (o.refreshToken) config.refreshToken = o.refreshToken;
    return { type: 'oauth2', config };
  }
  return undefined;
}

function tcRequestToNode(req: ThunderRequest, parentId: string): Collection {
  const apiRequest: ApiRequest = {
    id: generateId(),
    name: sanitizeName(req.name),
    method: mapHttpMethod(req.method),
    url: req.url ?? '',
    params: tcKvToRecord(req.params),
    headers: tcKvToRecord(req.headers),
    body: tcMapBody(req.body),
    auth: tcMapAuth(req.auth),
  };
  const vars = tcExtractPathVars(req.params);
  if (Object.keys(vars).length > 0) apiRequest.variables = vars;

  return {
    id: generateId(),
    name: apiRequest.name,
    type: 'request',
    parentId,
    request: apiRequest,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Map a Thunder Client collection file to Restbro format. */
export function mapThunderClientCollection(data: ThunderCollectionFile): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(data.collectionName ?? 'Thunder Client Collection'),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Build folder map: Thunder folders may nest via containerId.
  const folderMap = new Map<string, Collection>();
  const folders = [...(data.folders ?? [])].sort(
    (a, b) => (a.sortNum ?? 0) - (b.sortNum ?? 0)
  );
  // First pass: create folder nodes with provisional empty parentId
  for (const f of folders) {
    if (!f._id) continue;
    folderMap.set(f._id, {
      id: generateId(),
      name: sanitizeName(f.name),
      type: 'folder',
      parentId: rootId,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  // Second pass: link parents
  for (const f of folders) {
    if (!f._id) continue;
    const node = folderMap.get(f._id)!;
    const parent = f.containerId && folderMap.get(f.containerId);
    if (parent) {
      node.parentId = parent.id;
      parent.children!.push(node);
    } else {
      rootFolder.children!.push(node);
    }
  }

  const requests = [...(data.requests ?? [])].sort(
    (a, b) => (a.sortNum ?? 0) - (b.sortNum ?? 0)
  );
  for (const r of requests) {
    const parent = r.containerId && folderMap.get(r.containerId);
    if (parent) {
      const node = tcRequestToNode(r, parent.id);
      parent.children!.push(node);
    } else {
      const node = tcRequestToNode(r, rootId);
      rootFolder.children!.push(node);
    }
  }

  return { rootFolder, environments: [] };
}

/** Map a Thunder Client environment file to a Restbro Environment. */
export function mapThunderClientEnvironment(
  data: ThunderEnvironmentFile
): Environment {
  const variables: Record<string, string> = {};
  for (const v of data.data ?? []) {
    if (!v?.name) continue;
    variables[v.name] = v.value ?? '';
  }
  return {
    id: generateId(),
    name: sanitizeName(data.name ?? 'Thunder Environment'),
    variables,
  };
}

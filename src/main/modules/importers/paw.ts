/**
 * Paw / RapidAPI Client JSON-export importer.
 *
 * Paw's "Export → JSON" produces a single document keyed by integer IDs:
 *   {
 *     "<id>": {
 *       "title": "Get Users",
 *       "url": "https://api.example.com/users",
 *       "method": "GET",
 *       "headers": { "Accept": "application/json" },
 *       "body": "...",
 *       "type": "request" | "group",
 *       "parent": <parent-id>,
 *       "children": [<id>, ...]   // when type === 'group'
 *     }
 *   }
 *
 * The format is loose — older versions used different field names and
 * some entries lack a `type` discriminator. We treat anything with a
 * `method` + `url` as a request and anything with a `children` array as a
 * group. Anything else is dropped.
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

interface PawNode {
  title?: string;
  name?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string> | Array<{ name: string; value: string }>;
  body?: string | { raw?: string; mode?: string };
  type?: string;
  parent?: string | number;
  children?: Array<string | number>;
}

type PawDoc = Record<string, PawNode>;

export function isPawExport(data: any): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  // Heuristic: at least one entry has both `url` and `method`, and the
  // root is keyed by numeric strings (Paw always uses numeric ids).
  let numericKeys = 0;
  let requestLike = 0;
  for (const k of keys) {
    if (/^\d+$/.test(k)) numericKeys++;
    const v = data[k];
    if (v && typeof v === 'object' && v.method && v.url) requestLike++;
    if (numericKeys >= 1 && requestLike >= 1) break;
  }
  return numericKeys >= 1 && requestLike >= 1;
}

function pawHeadersToRecord(
  headers: PawNode['headers']
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h?.name) out[h.name] = h.value ?? '';
    }
    return out;
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      out[k] = String(v ?? '');
    }
  }
  return out;
}

function pawBodyToBody(body: PawNode['body']): ApiRequest['body'] {
  if (!body) return { type: 'none', content: '' };
  const text =
    typeof body === 'string'
      ? body
      : typeof body === 'object'
        ? (body.raw ?? '')
        : '';
  if (!text) return { type: 'none', content: '' };
  // Best-effort: detect JSON, otherwise raw.
  try {
    JSON.parse(text);
    return { type: 'json', content: text };
  } catch {
    return { type: 'raw', content: text };
  }
}

function isRequestNode(n: PawNode): boolean {
  if (n.type === 'request') return true;
  return Boolean(n.method && n.url);
}

function isGroupNode(n: PawNode): boolean {
  if (n.type === 'group') return true;
  return Array.isArray(n.children) && n.children.length > 0;
}

export function mapPawExport(doc: PawDoc): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: 'Paw Import',
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // First pass: build a node map keyed by Paw id with our own Restbro id.
  const restbroIdById = new Map<string, string>();
  const nodeById = new Map<string, Collection>();

  for (const id of Object.keys(doc)) {
    const node = doc[id];
    if (!node || typeof node !== 'object') continue;
    if (!isRequestNode(node) && !isGroupNode(node)) continue;

    const restbroId = generateId();
    restbroIdById.set(id, restbroId);

    const name = sanitizeName(node.title ?? node.name ?? `Item ${id}`);
    if (isGroupNode(node) && !isRequestNode(node)) {
      nodeById.set(id, {
        id: restbroId,
        name,
        type: 'folder',
        parentId: rootId,
        children: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      const apiRequest: ApiRequest = {
        id: generateId(),
        name,
        method: mapHttpMethod(node.method),
        url: node.url ?? '',
        params: {},
        headers: pawHeadersToRecord(node.headers),
        body: pawBodyToBody(node.body),
      };
      nodeById.set(id, {
        id: restbroId,
        name: apiRequest.name,
        type: 'request',
        parentId: rootId,
        request: apiRequest,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Second pass: link children to parents.
  for (const id of Object.keys(doc)) {
    const me = nodeById.get(id);
    if (!me) continue;
    const parentId = doc[id]?.parent != null ? String(doc[id].parent) : '';
    const parent = parentId ? nodeById.get(parentId) : undefined;
    if (parent && parent.type === 'folder') {
      me.parentId = parent.id;
      parent.children = parent.children ?? [];
      parent.children.push(me);
    } else {
      rootFolder.children!.push(me);
    }
  }

  return { rootFolder, environments: [] };
}

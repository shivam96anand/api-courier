/**
 * cURL command importer.
 *
 * Wraps the existing `parseCurlCommand` parser to produce a single-request
 * Restbro collection. The renderer surfaces this through a "Paste cURL"
 * option in the import chooser (no file required).
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';
import { parseCurlCommand } from '../curl-executor';

export function isCurlCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Must start with the literal `curl ` (case-insensitive) — be strict so
  // arbitrary text doesn't get mis-detected when falling back to text mode.
  return /^curl\b/i.test(trimmed);
}

function classifyBody(
  body: string | undefined,
  headers: Record<string, string>
): ApiRequest['body'] {
  if (!body) return { type: 'none', content: '' };
  const ct = (
    headers['Content-Type'] ??
    headers['content-type'] ??
    ''
  ).toLowerCase();
  if (ct.includes('json')) return { type: 'json', content: body };
  if (ct.includes('x-www-form-urlencoded'))
    return { type: 'form-urlencoded', content: body };
  if (ct.includes('multipart/form-data'))
    return { type: 'form-data', content: body };
  // Heuristic for missing Content-Type:
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return { type: 'json', content: body };
    } catch {
      // not JSON
    }
  }
  return { type: 'raw', content: body };
}

export function mapCurlCommand(text: string): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const parsed = parseCurlCommand(text);

  // Derive a friendly name from URL path.
  let name = `${parsed.method} request`;
  try {
    const u = new URL(parsed.url);
    name = `${parsed.method} ${u.pathname || u.host || u.href}`;
  } catch {
    name = `${parsed.method} ${parsed.url || 'request'}`;
  }

  const apiRequest: ApiRequest = {
    id: generateId(),
    name: sanitizeName(name),
    method: mapHttpMethod(parsed.method),
    url: parsed.url,
    params: {},
    headers: parsed.headers,
    body: classifyBody(parsed.body, parsed.headers),
  };

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: 'cURL Import',
    type: 'folder',
    children: [
      {
        id: generateId(),
        name: apiRequest.name,
        type: 'request',
        parentId: rootId,
        request: apiRequest,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { rootFolder, environments: [] };
}

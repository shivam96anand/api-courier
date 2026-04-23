/**
 * HAR (HTTP Archive) v1.2 importer.
 *
 * Browsers and proxies (Chrome/Firefox/Safari DevTools, Charles, mitmproxy,
 * Fiddler, Insomnia) all export `.har` files. Each `log.entries[]` is a
 * captured request/response pair. We import only the requests.
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

interface HarHeader {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value?: string; fileName?: string }>;
}

interface HarRequest {
  method?: string;
  url?: string;
  httpVersion?: string;
  headers?: HarHeader[];
  queryString?: HarHeader[];
  postData?: HarPostData;
}

interface HarEntry {
  request?: HarRequest;
  comment?: string;
  pageref?: string;
  startedDateTime?: string;
}

interface HarLog {
  version?: string;
  creator?: { name?: string };
  entries?: HarEntry[];
}

interface HarFile {
  log?: HarLog;
}

/** Detect a HAR document. */
export function isHarDocument(data: any): boolean {
  return Boolean(
    data &&
      typeof data === 'object' &&
      data.log &&
      typeof data.log === 'object' &&
      Array.isArray(data.log.entries)
  );
}

/** Strip query string from a URL for naming purposes. */
function shortNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname || '/'}${u.search ? '?' : ''}`;
  } catch {
    return url;
  }
}

function harHeadersToRecord(headers?: HarHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(headers)) return out;
  for (const h of headers) {
    if (!h || !h.name) continue;
    // HAR includes pseudo-headers (`:method`, `:authority`) on HTTP/2;
    // skip those because they're not real wire headers.
    if (h.name.startsWith(':')) continue;
    // Skip body-derived headers — Restbro will set them itself.
    const lower = h.name.toLowerCase();
    if (lower === 'content-length') continue;
    out[h.name] = h.value ?? '';
  }
  return out;
}

function harQueryToRecord(qs?: HarHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(qs)) return out;
  for (const q of qs) {
    if (!q || !q.name) continue;
    out[q.name] = q.value ?? '';
  }
  return out;
}

function mapPostData(post?: HarPostData): ApiRequest['body'] {
  if (!post) return { type: 'none', content: '' };
  const mime = (post.mimeType ?? '').toLowerCase();

  if (mime.includes('application/json') && typeof post.text === 'string') {
    return { type: 'json', content: post.text };
  }
  if (mime.includes('x-www-form-urlencoded')) {
    if (Array.isArray(post.params)) {
      const pairs = post.params
        .map(
          (p) =>
            `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value ?? '')}`
        )
        .join('&');
      return { type: 'form-urlencoded', content: pairs };
    }
    return { type: 'form-urlencoded', content: post.text ?? '' };
  }
  if (mime.includes('multipart/form-data') && Array.isArray(post.params)) {
    const lines = post.params
      .map((p) => `${p.name}=${p.value ?? p.fileName ?? ''}`)
      .join('\n');
    return { type: 'form-data', content: lines };
  }
  if (typeof post.text === 'string' && post.text.length > 0) {
    return { type: 'raw', content: post.text };
  }
  return { type: 'none', content: '' };
}

/** Convert a HAR file to a Restbro collection tree. */
export function mapHarDocument(data: HarFile): {
  rootFolder: Collection;
  environments: Environment[];
} {
  const creator = data.log?.creator?.name ?? 'HAR';
  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(`${creator} Capture`),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Group entries by host so the output is browsable.
  const hostFolders = new Map<string, Collection>();
  const getHostFolder = (host: string): Collection => {
    let folder = hostFolders.get(host);
    if (folder) return folder;
    folder = {
      id: generateId(),
      name: sanitizeName(host || 'Other'),
      type: 'folder',
      parentId: rootId,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    hostFolders.set(host, folder);
    return folder;
  };

  for (const entry of data.log?.entries ?? []) {
    const r = entry?.request;
    if (!r || !r.url) continue;

    let host = '';
    try {
      host = new URL(r.url).host;
    } catch {
      host = 'Unknown';
    }
    const folder = getHostFolder(host);

    const apiRequest: ApiRequest = {
      id: generateId(),
      name: sanitizeName(
        `${(r.method ?? 'GET').toUpperCase()} ${shortNameFromUrl(r.url)}`
      ),
      method: mapHttpMethod(r.method),
      url: r.url,
      params: harQueryToRecord(r.queryString),
      headers: harHeadersToRecord(r.headers),
      body: mapPostData(r.postData),
    };

    folder.children!.push({
      id: generateId(),
      name: apiRequest.name,
      type: 'request',
      parentId: folder.id,
      request: apiRequest,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  rootFolder.children = [...hostFolders.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { rootFolder, environments: [] };
}

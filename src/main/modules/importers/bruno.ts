/**
 * Bruno collection importer.
 *
 * Bruno (https://www.usebruno.com/) stores collections as a directory of
 * plain-text `.bru` files instead of a single JSON export. This module walks
 * a Bruno collection directory and converts it to a Restbro `Collection`
 * tree.
 *
 * Expected layout (the parts we use):
 *
 *   <root>/
 *     bruno.json                 # { name, version, type: "collection" }
 *     collection.bru             # optional — root-level meta/auth/headers/vars
 *     environments/
 *       <env>.bru                # one Bruno environment per file
 *     <Folder>/
 *       folder.bru               # optional — folder display name
 *       <Request>.bru
 *
 * Anything we don't recognise (scripts, tests, docs) is dropped on import —
 * Restbro doesn't model those concepts.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';
import {
  BruBlock,
  dictToRecord,
  findBlock,
  parseBruFile,
} from './bruno-bru-parser';

const HTTP_VERB_BLOCKS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

/**
 * Quick check that a directory looks like a Bruno collection.
 * Resolves true when `<dir>/bruno.json` exists and declares
 * `"type": "collection"`. We deliberately also accept directories that just
 * contain `.bru` files at the top level, since some older Bruno collections
 * shipped without `bruno.json`.
 */
export async function isBrunoCollectionDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return false;
  } catch {
    return false;
  }

  // Prefer bruno.json signal.
  try {
    const raw = await fs.readFile(path.join(dir, 'bruno.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === 'collection') return true;
  } catch {
    // fall through
  }

  // Fallback: any `.bru` file in the directory tree counts.
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.bru')) return true;
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        // Don't recurse deeply for detection — one level is enough signal.
        const sub = await fs.readdir(path.join(dir, entry.name));
        if (sub.some((n) => n.endsWith('.bru'))) return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Map a Bruno collection directory to Restbro format.
 * Throws if `dir` doesn't look like a Bruno collection.
 */
export async function mapBrunoCollection(dir: string): Promise<{
  rootFolder: Collection;
  environments: Environment[];
}> {
  if (!(await isBrunoCollectionDir(dir))) {
    throw new Error('Selected folder is not a Bruno collection');
  }

  // Root collection name from bruno.json (preferred) or folder name.
  let rootName = path.basename(dir);
  try {
    const raw = await fs.readFile(path.join(dir, 'bruno.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
      rootName = parsed.name.trim();
    }
  } catch {
    // ignore — keep folder name
  }

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(rootName),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  rootFolder.children = await readDirectoryAsChildren(dir, rootId, true);

  const environments = await readEnvironments(dir);
  return { rootFolder, environments };
}

/**
 * Recursively read a directory's `.bru` files and subdirectories into
 * Restbro collection children. The `isRoot` flag suppresses the special
 * `environments/` folder and `bruno.json` / `collection.bru` files.
 */
async function readDirectoryAsChildren(
  dir: string,
  parentId: string,
  isRoot: boolean
): Promise<Collection[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const children: Collection[] = [];
  // Sort for deterministic ordering: folders alphabetically, then files.
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isRoot && entry.name === 'environments') continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      children.push(await readFolder(fullPath, parentId));
    } else if (entry.isFile() && entry.name.endsWith('.bru')) {
      // Skip folder/collection metadata files at this level.
      if (entry.name === 'folder.bru') continue;
      if (isRoot && entry.name === 'collection.bru') continue;
      const node = await readRequestFile(fullPath, parentId);
      if (node) children.push(node);
    }
  }

  return children;
}

/** Read one folder, deriving display name from `folder.bru` when present. */
async function readFolder(
  folderPath: string,
  parentId: string
): Promise<Collection> {
  const folderId = generateId();
  let displayName = path.basename(folderPath);

  try {
    const raw = await fs.readFile(path.join(folderPath, 'folder.bru'), 'utf-8');
    const blocks = parseBruFile(raw);
    const meta = findBlock(blocks, 'meta');
    if (meta && meta.body.kind === 'dict') {
      const rec = dictToRecord(meta.body.entries);
      if (rec.name && rec.name.trim()) displayName = rec.name.trim();
    }
  } catch {
    // No folder.bru → use directory name.
  }

  const folder: Collection = {
    id: folderId,
    name: sanitizeName(displayName),
    type: 'folder',
    parentId,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  folder.children = await readDirectoryAsChildren(folderPath, folderId, false);
  return folder;
}

interface RequestNodeWithSeq {
  node: Collection;
  seq: number;
}

/**
 * Parse one `.bru` request file into a Collection node, or null if the file
 * isn't a valid request (e.g. parse failure, no HTTP verb block).
 */
async function readRequestFile(
  filePath: string,
  parentId: string
): Promise<Collection | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  let blocks: BruBlock[];
  try {
    blocks = parseBruFile(raw);
  } catch {
    return null;
  }

  // Must contain at least one HTTP-verb block.
  const verbBlock = blocks.find((b) => HTTP_VERB_BLOCKS.has(b.name));
  if (!verbBlock || verbBlock.body.kind !== 'dict') return null;

  const verbDict = dictToRecord(verbBlock.body.entries);
  const meta = findBlock(blocks, 'meta');
  const metaDict =
    meta && meta.body.kind === 'dict' ? dictToRecord(meta.body.entries) : {};

  const requestName =
    metaDict.name?.trim() ||
    path.basename(filePath, '.bru').trim() ||
    'Untitled';

  const apiRequest: ApiRequest = {
    id: generateId(),
    name: sanitizeName(requestName),
    method: mapHttpMethod(verbBlock.name.toUpperCase()),
    url: verbDict.url ?? '',
    params: extractQuery(blocks),
    headers: extractHeaders(blocks),
    body: extractBody(blocks, verbDict.body),
    auth: extractAuth(blocks, verbDict.auth),
  };

  const variables = extractRequestVars(blocks);
  if (Object.keys(variables).length > 0) apiRequest.variables = variables;

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

function extractHeaders(blocks: BruBlock[]): Record<string, string> {
  const headers = findBlock(blocks, 'headers');
  if (!headers || headers.body.kind !== 'dict') return {};
  return dictToRecord(headers.body.entries);
}

function extractQuery(blocks: BruBlock[]): Record<string, string> {
  // Bruno uses `params:query` in newer versions and `query` in older ones.
  const block = findBlock(blocks, 'params:query') ?? findBlock(blocks, 'query');
  if (!block || block.body.kind !== 'dict') return {};
  return dictToRecord(block.body.entries);
}

function extractRequestVars(blocks: BruBlock[]): Record<string, string> {
  const block = findBlock(blocks, 'vars:pre-request');
  if (!block || block.body.kind !== 'dict') return {};
  return dictToRecord(block.body.entries);
}

function extractBody(
  blocks: BruBlock[],
  bodyMode?: string
): ApiRequest['body'] {
  const mode = (bodyMode ?? 'none').toLowerCase();
  if (mode === 'none' || mode === '') return { type: 'none', content: '' };

  if (mode === 'json') {
    const block = findBlock(blocks, 'body:json');
    const text = block && block.body.kind === 'raw' ? block.body.text : '';
    return { type: 'json', content: text };
  }

  if (mode === 'text') {
    const block = findBlock(blocks, 'body:text');
    const text = block && block.body.kind === 'raw' ? block.body.text : '';
    return { type: 'raw', content: text };
  }

  if (mode === 'xml') {
    const block = findBlock(blocks, 'body:xml');
    const text = block && block.body.kind === 'raw' ? block.body.text : '';
    return { type: 'raw', content: text, format: 'xml' };
  }

  if (
    mode === 'form-urlencoded' ||
    mode === 'formurlencoded' ||
    mode === 'urlencoded'
  ) {
    const block = findBlock(blocks, 'body:form-urlencoded');
    if (!block) return { type: 'form-urlencoded', content: '' };
    if (block.body.kind === 'dict') {
      const pairs: string[] = [];
      for (const e of block.body.entries) {
        if (!e.enabled) continue;
        pairs.push(
          `${encodeURIComponent(e.key)}=${encodeURIComponent(e.value)}`
        );
      }
      return { type: 'form-urlencoded', content: pairs.join('&') };
    }
    return { type: 'form-urlencoded', content: block.body.text };
  }

  if (
    mode === 'multipart-form' ||
    mode === 'multipartform' ||
    mode === 'multipart'
  ) {
    const block = findBlock(blocks, 'body:multipart-form');
    if (!block) return { type: 'form-data', content: '' };
    if (block.body.kind === 'dict') {
      const lines = block.body.entries
        .filter((e) => e.enabled)
        .map((e) => `${e.key}=${e.value}`);
      return { type: 'form-data', content: lines.join('\n') };
    }
    return { type: 'form-data', content: block.body.text };
  }

  if (mode === 'graphql') {
    const block = findBlock(blocks, 'body:graphql');
    const text = block && block.body.kind === 'raw' ? block.body.text : '';
    return { type: 'json', content: text };
  }

  return { type: 'none', content: '' };
}

function extractAuth(
  blocks: BruBlock[],
  authMode?: string
): ApiRequest['auth'] {
  const mode = (authMode ?? 'none').toLowerCase();
  if (mode === 'none' || mode === '' || mode === 'inherit') return undefined;

  if (mode === 'basic') {
    const block = findBlock(blocks, 'auth:basic');
    if (!block || block.body.kind !== 'dict') return undefined;
    const rec = dictToRecord(block.body.entries);
    return {
      type: 'basic',
      config: { username: rec.username ?? '', password: rec.password ?? '' },
    };
  }

  if (mode === 'bearer') {
    const block = findBlock(blocks, 'auth:bearer');
    if (!block || block.body.kind !== 'dict') return undefined;
    const rec = dictToRecord(block.body.entries);
    return { type: 'bearer', config: { token: rec.token ?? '' } };
  }

  if (mode === 'apikey' || mode === 'api-key') {
    const block =
      findBlock(blocks, 'auth:apikey') ?? findBlock(blocks, 'auth:api-key');
    if (!block || block.body.kind !== 'dict') return undefined;
    const rec = dictToRecord(block.body.entries);
    const placement = (rec.placement ?? 'header').toLowerCase();
    const location =
      placement === 'queryparams' || placement === 'query' ? 'query' : 'header';
    return {
      type: 'api-key',
      config: {
        key: rec.key ?? '',
        value: rec.value ?? '',
        location,
        in: location,
      },
    };
  }

  if (mode === 'oauth2') {
    const block = findBlock(blocks, 'auth:oauth2');
    if (!block || block.body.kind !== 'dict') return undefined;
    const rec = dictToRecord(block.body.entries);
    const config: Record<string, string> = {};
    if (rec.grant_type) config.grantType = rec.grant_type;
    if (rec.authorization_url) config.authUrl = rec.authorization_url;
    if (rec.access_token_url) {
      config.tokenUrl = rec.access_token_url;
      config.accessTokenUrl = rec.access_token_url;
    }
    if (rec.client_id) config.clientId = rec.client_id;
    if (rec.client_secret) config.clientSecret = rec.client_secret;
    if (rec.scope) config.scope = rec.scope;
    if (rec.access_token) config.accessToken = rec.access_token;
    if (rec.refresh_token) config.refreshToken = rec.refresh_token;
    return { type: 'oauth2', config };
  }

  return undefined;
}

/**
 * Read all `.bru` files under `<dir>/environments/` as Restbro Environments.
 * Each Bruno env file uses a `vars { key: value }` block.
 */
async function readEnvironments(dir: string): Promise<Environment[]> {
  const envDir = path.join(dir, 'environments');
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(envDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: Environment[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.bru')) continue;
    let raw: string;
    try {
      raw = await fs.readFile(path.join(envDir, entry.name), 'utf-8');
    } catch {
      continue;
    }
    let blocks: BruBlock[];
    try {
      blocks = parseBruFile(raw);
    } catch {
      continue;
    }

    const vars = findBlock(blocks, 'vars');
    const variables =
      vars && vars.body.kind === 'dict' ? dictToRecord(vars.body.entries) : {};

    out.push({
      id: generateId(),
      name: sanitizeName(path.basename(entry.name, '.bru')),
      variables,
    });
  }
  return out;
}

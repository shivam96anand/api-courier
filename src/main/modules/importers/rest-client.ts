/**
 * REST Client / .http file importer.
 *
 * Used by VS Code "REST Client" (humao.rest-client) and JetBrains IDEs.
 * Format:
 *
 *   ### Optional request name
 *   GET https://api.example.com/users HTTP/1.1
 *   Accept: application/json
 *   Authorization: Bearer xyz
 *
 *   {
 *     "optional": "json body"
 *   }
 *
 *   ### Next request
 *   POST {{baseUrl}}/users
 *   Content-Type: application/json
 *
 *   < ./payload.json   (file include — captured as raw text)
 *
 * Variables (`@name = value`) at the top of the file become a Restbro
 * environment named "<filename> Variables" — but since this parser is
 * filename-agnostic, the caller passes the env name in.
 */

import { Collection, ApiRequest, Environment } from '../../../shared/types';
import { generateId, mapHttpMethod, sanitizeName } from './mappers';

const REQUEST_LINE_RE =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+?)(?:\s+HTTP\/\d(?:\.\d)?)?\s*$/i;

/**
 * Detects whether a raw text payload is a REST Client (.http) document.
 * We require at least one HTTP request line and no obvious non-text noise
 * (NUL bytes, leading `{`).
 */
export function isRestClientText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  if (text.includes('\u0000')) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Looks like JSON / XML / YAML — bail out so JSON detectors win.
  const first = trimmed[0];
  if (first === '{' || first === '[' || first === '<') return false;
  for (const line of trimmed.split(/\r?\n/)) {
    if (REQUEST_LINE_RE.test(line.trim())) return true;
  }
  return false;
}

interface ParsedBlock {
  name?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

function splitBlocks(text: string): {
  vars: Record<string, string>;
  blocks: ParsedBlock[];
} {
  const vars: Record<string, string> = {};
  const blocks: ParsedBlock[] = [];

  // Normalise newlines and split on `###` separators.
  const normalised = text.replace(/\r\n/g, '\n');
  const rawSections = normalised.split(/^###.*$/m);
  // The first section is the preamble (variable declarations) only if it
  // doesn't itself contain a request line.
  let firstParsed = false;
  for (let s = 0; s < rawSections.length; s++) {
    const section = rawSections[s];
    if (!section.trim()) continue;

    if (!firstParsed) {
      // Check if the first section is preamble (only `@var = value` lines).
      const lines = section.split('\n');
      const looksLikePreamble = !lines.some((l) =>
        REQUEST_LINE_RE.test(l.trim())
      );
      if (looksLikePreamble) {
        for (const line of lines) {
          const m = line.match(/^@([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/);
          if (m) vars[m[1]] = m[2];
        }
        firstParsed = true;
        continue;
      }
      firstParsed = true;
    }

    // Extract the request line, headers, and body within this section.
    const lines = section.split('\n');
    let i = 0;
    // Skip leading blank lines and `@var = ...` lines (locally scoped vars
    // — we just promote them to global vars too).
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === '') {
        i++;
        continue;
      }
      const m = line.match(/^@([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/);
      if (m) {
        vars[m[1]] = m[2];
        i++;
        continue;
      }
      break;
    }
    if (i >= lines.length) continue;

    // Optional comment lines starting with `#` or `//` before request line.
    while (
      i < lines.length &&
      (lines[i].trim().startsWith('#') || lines[i].trim().startsWith('//'))
    ) {
      i++;
    }

    const reqLine = lines[i++]?.trim() ?? '';
    const reqMatch = reqLine.match(REQUEST_LINE_RE);
    if (!reqMatch) continue;
    const method = reqMatch[1].toUpperCase();
    const url = reqMatch[2].trim();

    // Headers: lines until blank line or EOF.
    const headers: Record<string, string> = {};
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        i++;
        break;
      }
      const colon = line.indexOf(':');
      if (colon > 0) {
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (key) headers[key] = value;
      }
      i++;
    }

    // Body: remaining lines until end of section (trim trailing blanks).
    const bodyLines = lines.slice(i);
    while (
      bodyLines.length > 0 &&
      bodyLines[bodyLines.length - 1].trim() === ''
    )
      bodyLines.pop();
    const body = bodyLines.join('\n');

    blocks.push({ method, url, headers, body });
  }

  return { vars, blocks };
}

function classifyBody(
  headers: Record<string, string>,
  body: string
): ApiRequest['body'] {
  if (!body || body.trim() === '') return { type: 'none', content: '' };
  const ct = (
    headers['Content-Type'] ??
    headers['content-type'] ??
    ''
  ).toLowerCase();
  if (ct.includes('json')) return { type: 'json', content: body };
  if (ct.includes('x-www-form-urlencoded'))
    return { type: 'form-urlencoded', content: body };
  if (ct.includes('xml')) return { type: 'raw', content: body, format: 'xml' };
  // Heuristic for missing Content-Type:
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return { type: 'json', content: body };
    } catch {
      // fall through
    }
  }
  return { type: 'raw', content: body };
}

/**
 * Parse a `.http` / `.rest` file and produce a Restbro collection.
 * `defaultName` is used as both the root folder and the env name.
 */
export function mapRestClientText(
  text: string,
  defaultName = 'REST Client Import'
): { rootFolder: Collection; environments: Environment[] } {
  const { vars, blocks } = splitBlocks(text);

  const rootId = generateId();
  const rootFolder: Collection = {
    id: rootId,
    name: sanitizeName(defaultName),
    type: 'folder',
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let counter = 0;
  for (const b of blocks) {
    counter++;
    let name = b.name ?? '';
    if (!name) {
      try {
        name = `${b.method} ${new URL(b.url.replace(/\{\{[^}]+\}\}/g, 'x')).pathname || b.url}`;
      } catch {
        name = `${b.method} request ${counter}`;
      }
    }
    const apiRequest: ApiRequest = {
      id: generateId(),
      name: sanitizeName(name),
      method: mapHttpMethod(b.method),
      url: b.url,
      params: {},
      headers: b.headers,
      body: classifyBody(b.headers, b.body),
    };

    rootFolder.children!.push({
      id: generateId(),
      name: apiRequest.name,
      type: 'request',
      parentId: rootId,
      request: apiRequest,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const environments: Environment[] =
    Object.keys(vars).length > 0
      ? [
          {
            id: generateId(),
            name: `${sanitizeName(defaultName)} Variables`,
            variables: vars,
          },
        ]
      : [];

  return { rootFolder, environments };
}

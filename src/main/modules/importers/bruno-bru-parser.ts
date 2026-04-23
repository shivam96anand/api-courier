/**
 * Bruno `.bru` text-format parser.
 *
 * `.bru` files are blocks of the form:
 *
 *   blockName {
 *     key: value
 *     ~disabled-key: value
 *   }
 *
 * Some block bodies are dictionaries (one `key: value` per line), some are
 * raw text (e.g. `body:json`, `body:xml`, `script:pre-request`, `tests`,
 * `docs`). For raw blocks we capture the inner text verbatim.
 *
 * This parser is intentionally small: it only handles the constructs Restbro
 * cares about (meta, get/post/..., headers, query, body:*, auth:*, vars:*).
 * Unknown blocks are preserved as raw text so future passes can use them.
 */

export type BruBlockBody =
  | { kind: 'dict'; entries: BruDictEntry[] }
  | { kind: 'raw'; text: string };

export interface BruDictEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface BruBlock {
  name: string;
  body: BruBlockBody;
}

const RAW_BLOCK_PREFIXES = [
  'body:json',
  'body:text',
  'body:xml',
  'body:sparql',
  'body:graphql',
  'body:graphql:vars',
  'body:form-urlencoded', // some versions use raw, we'll re-detect in mapper
  'body:multipart-form',
  'script:pre-request',
  'script:post-response',
  'tests',
  'docs',
];

function isRawBlock(name: string): boolean {
  return RAW_BLOCK_PREFIXES.includes(name);
}

/**
 * Parse a `.bru` file into a list of blocks. Tolerant of trailing whitespace
 * and CRLF line endings. Throws on structurally broken input (unmatched
 * braces) so callers can skip the file with a useful error.
 */
export function parseBruFile(input: string): BruBlock[] {
  const text = input.replace(/\r\n/g, '\n');
  const blocks: BruBlock[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace + blank lines.
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;

    // Read block header: name up to '{'.
    const headerStart = i;
    while (i < text.length && text[i] !== '{' && text[i] !== '\n') i++;
    if (i >= text.length || text[i] !== '{') {
      throw new Error(
        `Bru parse error: expected '{' after block name at offset ${headerStart}`
      );
    }
    const blockName = text.slice(headerStart, i).trim();
    i++; // consume '{'

    // Find matching '}' respecting nesting (raw blocks like body:json contain braces).
    const bodyStart = i;
    let depth = 1;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth > 0) i++;
    }
    if (depth !== 0) {
      throw new Error(
        `Bru parse error: unmatched '{' for block "${blockName}"`
      );
    }
    const bodyText = text.slice(bodyStart, i);
    i++; // consume '}'

    const body: BruBlockBody = isRawBlock(blockName)
      ? { kind: 'raw', text: trimRawBody(bodyText) }
      : { kind: 'dict', entries: parseDictBody(bodyText) };

    blocks.push({ name: blockName, body });
  }

  return blocks;
}

/** Trim a single leading and trailing newline (the braces' own line breaks). */
function trimRawBody(text: string): string {
  let start = 0;
  let end = text.length;
  if (text[start] === '\n') start++;
  if (end > start && text[end - 1] === '\n') end--;
  return text.slice(start, end);
}

/**
 * Parse a dictionary-style block body. Lines look like:
 *   key: value with optional spaces
 *   ~disabled: value
 * Blank lines are ignored. Lines without a colon are ignored (Bruno does the
 * same — they have no semantic meaning).
 */
function parseDictBody(text: string): BruDictEntry[] {
  const entries: BruDictEntry[] = [];
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    let key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    let enabled = true;
    if (key.startsWith('~')) {
      enabled = false;
      key = key.slice(1).trim();
    }
    if (key.length === 0) continue;
    entries.push({ key, value, enabled });
  }
  return entries;
}

/** Convert a list of dict entries into a `Record<string,string>`. */
export function dictToRecord(entries: BruDictEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (!e.enabled) continue;
    out[e.key] = e.value;
  }
  return out;
}

/** Find the first block whose name matches `name`. */
export function findBlock(
  blocks: BruBlock[],
  name: string
): BruBlock | undefined {
  return blocks.find((b) => b.name === name);
}

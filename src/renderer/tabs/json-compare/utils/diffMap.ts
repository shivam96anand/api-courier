/**
 * Pure functions for mapping jsondiffpatch deltas to diff rows and decorations
 */

import type { DiffRow, DiffDecoration, DiffChangeType } from '../types';
import { buildIgnoreMatcher } from './pathMatcher';

interface Delta {
  [key: string]: unknown;
}

interface PathPosition {
  path: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Converts path segments to JSON Pointer (RFC 6901)
 */
export function toJsonPointer(pathSegments: string[]): string {
  if (pathSegments.length === 0) return '';
  return (
    '/' +
    pathSegments
      .map((seg) => seg.replace(/~/g, '~0').replace(/\//g, '~1'))
      .join('/')
  );
}

/**
 * Builds flat list of diff rows from jsondiffpatch delta
 */
export function buildDiffRows(
  delta: Delta | undefined,
  basePath: string[] = []
): DiffRow[] {
  if (!delta) return [];

  const rows: DiffRow[] = [];
  const isArrayDelta = delta['_t'] === 'a';

  for (const key of Object.keys(delta)) {
    // Skip jsondiffpatch meta keys
    if (key === '_t') continue;

    const value = delta[key];

    // jsondiffpatch uses _N keys (e.g. _0, _1) for items deleted/moved from
    // their original index in array deltas. Strip the leading _ so the path
    // segment reflects the original index.
    const pathKey =
      isArrayDelta && key.startsWith('_') && !isNaN(Number(key.slice(1)))
        ? key.slice(1)
        : key;

    const currentPath = [...basePath, pathKey];
    const pathStr = toJsonPointer(currentPath);

    if (Array.isArray(value)) {
      // jsondiffpatch array format:
      //   [newValue]          = added
      //   [oldValue, 0, 0]    = deleted
      //   [oldValue, newValue]= changed (simple replacement)
      //   [patch, 0, 2]       = text diff (string longer than textDiff.minLength)
      //   ["", newIdx, 3]     = array item moved (detectMove)
      if (value.length === 1) {
        rows.push({ path: pathStr, type: 'added', rightValue: value[0] });
      } else if (value.length === 3 && value[1] === 0 && value[2] === 0) {
        rows.push({ path: pathStr, type: 'removed', leftValue: value[0] });
      } else if (value.length === 2) {
        rows.push({
          path: pathStr,
          type: 'changed',
          leftValue: value[0],
          rightValue: value[1],
        });
      } else if (value.length === 3 && value[2] === 2) {
        // Text diff format — old/new not directly available without applying the patch.
        // Show as changed; values are retrieved from the parsed JSON by the caller if needed.
        rows.push({ path: pathStr, type: 'changed' });
      }
      // value[2] === 3 = array move; skip (item still exists, just reordered)
    } else if (typeof value === 'object' && value !== null) {
      // Nested object/array delta — recurse
      rows.push(...buildDiffRows(value as Delta, currentPath));
    }
  }

  return rows;
}

/**
 * Filter diff rows by user-supplied ignore-path glob patterns.
 * Patterns use the syntax described in pathMatcher (e.g. "/audit/**", "/* /createdAt").
 */
export function filterDiffRowsByIgnorePaths(
  rows: DiffRow[],
  ignorePaths: string[] | undefined
): DiffRow[] {
  if (!ignorePaths || ignorePaths.length === 0) return rows;
  const isIgnored = buildIgnoreMatcher(ignorePaths);
  return rows.filter((r) => !isIgnored(r.path));
}

/**
 * Memoized position map: parses each unique JSON text only once.
 * Cache is bounded so it can't grow unbounded for power users.
 */
const POSITION_CACHE = new Map<string, PathPosition[]>();
const POSITION_CACHE_MAX = 8;

function getPositionMap(jsonText: string): PathPosition[] {
  const cached = POSITION_CACHE.get(jsonText);
  if (cached) return cached;
  const positions = buildPositionMap(jsonText);
  if (POSITION_CACHE.size >= POSITION_CACHE_MAX) {
    // Evict oldest (Map preserves insertion order)
    const firstKey = POSITION_CACHE.keys().next().value;
    if (firstKey !== undefined) POSITION_CACHE.delete(firstKey);
  }
  POSITION_CACHE.set(jsonText, positions);
  return positions;
}

/**
 * Exact text range finder using a JSON parser that records offsets per JSON Pointer path.
 */
export function findTextRangeForPath(
  jsonText: string,
  path: string
): {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
} | null {
  const pathSegments =
    path === ''
      ? []
      : path
          .slice(1)
          .split('/')
          .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));

  if (pathSegments.length === 0) {
    // Root - entire document
    const lines = jsonText.split('\n');
    return {
      startLine: 1,
      startColumn: 1,
      endLine: lines.length,
      endColumn: lines[lines.length - 1].length + 1,
    };
  }

  // Build position map (cached per jsonText)
  const positions = getPositionMap(jsonText);

  // Find matching path
  const match = positions.find((p) => p.path === path);
  if (!match) return null;

  return offsetToLineColumn(jsonText, match.startOffset, match.endOffset);
}

/**
 * Build exact position map for JSON values by parsing text once.
 */
function buildPositionMap(jsonText: string): PathPosition[] {
  const positions: PathPosition[] = [];
  let i = 0;

  const isWhitespace = (ch: string) =>
    ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
  const skipWhitespace = () => {
    while (i < jsonText.length && isWhitespace(jsonText[i])) i++;
  };

  const parseStringToken = (): {
    value: string;
    start: number;
    end: number;
  } => {
    if (jsonText[i] !== '"') throw new Error('Invalid JSON string');

    const start = i;
    i++; // opening quote
    let value = '';

    while (i < jsonText.length) {
      const ch = jsonText[i];
      if (ch === '"') {
        i++; // closing quote
        return { value, start, end: i };
      }

      if (ch === '\\') {
        i++;
        if (i >= jsonText.length) throw new Error('Invalid escape sequence');
        const esc = jsonText[i];
        switch (esc) {
          case '"':
            value += '"';
            break;
          case '\\':
            value += '\\';
            break;
          case '/':
            value += '/';
            break;
          case 'b':
            value += '\b';
            break;
          case 'f':
            value += '\f';
            break;
          case 'n':
            value += '\n';
            break;
          case 'r':
            value += '\r';
            break;
          case 't':
            value += '\t';
            break;
          case 'u': {
            const hex = jsonText.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex))
              throw new Error('Invalid unicode escape');
            value += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            throw new Error('Invalid escape sequence');
        }
        i++;
        continue;
      }

      value += ch;
      i++;
    }

    throw new Error('Unterminated JSON string');
  };

  const parsePrimitive = (path: string[], start: number): void => {
    if (jsonText.startsWith('true', i)) {
      i += 4;
    } else if (jsonText.startsWith('false', i)) {
      i += 5;
    } else if (jsonText.startsWith('null', i)) {
      i += 4;
    } else {
      const numberMatch = jsonText
        .slice(i)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!numberMatch) throw new Error('Invalid JSON primitive');
      i += numberMatch[0].length;
    }

    if (path.length > 0) {
      positions.push({
        path: toJsonPointer(path),
        startOffset: start,
        endOffset: i,
      });
    }
  };

  const parseValue = (path: string[]): void => {
    skipWhitespace();
    const start = i;
    const ch = jsonText[i];

    if (ch === '{') {
      parseObject(path, start);
      return;
    }
    if (ch === '[') {
      parseArray(path, start);
      return;
    }
    if (ch === '"') {
      const token = parseStringToken();
      if (path.length > 0) {
        positions.push({
          path: toJsonPointer(path),
          startOffset: start,
          endOffset: token.end,
        });
      }
      return;
    }

    parsePrimitive(path, start);
  };

  const parseObject = (path: string[], start: number): void => {
    i++; // {
    skipWhitespace();

    if (jsonText[i] === '}') {
      i++;
      if (path.length > 0) {
        positions.push({
          path: toJsonPointer(path),
          startOffset: start,
          endOffset: i,
        });
      }
      return;
    }

    while (i < jsonText.length) {
      skipWhitespace();
      const keyToken = parseStringToken();
      skipWhitespace();
      if (jsonText[i] !== ':') throw new Error('Invalid object: missing colon');
      i++; // :

      parseValue([...path, keyToken.value]);
      skipWhitespace();

      if (jsonText[i] === ',') {
        i++;
        continue;
      }
      if (jsonText[i] === '}') {
        i++;
        if (path.length > 0) {
          positions.push({
            path: toJsonPointer(path),
            startOffset: start,
            endOffset: i,
          });
        }
        return;
      }

      throw new Error('Invalid object: missing comma or closing brace');
    }

    throw new Error('Unterminated object');
  };

  const parseArray = (path: string[], start: number): void => {
    i++; // [
    skipWhitespace();

    if (jsonText[i] === ']') {
      i++;
      if (path.length > 0) {
        positions.push({
          path: toJsonPointer(path),
          startOffset: start,
          endOffset: i,
        });
      }
      return;
    }

    let index = 0;
    while (i < jsonText.length) {
      parseValue([...path, String(index)]);
      index++;
      skipWhitespace();

      if (jsonText[i] === ',') {
        i++;
        continue;
      }
      if (jsonText[i] === ']') {
        i++;
        if (path.length > 0) {
          positions.push({
            path: toJsonPointer(path),
            startOffset: start,
            endOffset: i,
          });
        }
        return;
      }

      throw new Error('Invalid array: missing comma or closing bracket');
    }

    throw new Error('Unterminated array');
  };

  try {
    parseValue([]);
    skipWhitespace();
    if (i !== jsonText.length) {
      return [];
    }
    return positions;
  } catch {
    // Invalid JSON - return empty
    return [];
  }
}

function offsetToLineColumn(
  text: string,
  startOffset: number,
  endOffset: number
): {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
} {
  let line = 1;
  let col = 1;
  let startLine = 1,
    startColumn = 1,
    endLine = 1,
    endColumn = 1;

  for (let i = 0; i < text.length; i++) {
    if (i === startOffset) {
      startLine = line;
      startColumn = col;
    }
    if (i === endOffset) {
      endLine = line;
      endColumn = col;
      break;
    }
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  return { startLine, startColumn, endLine, endColumn };
}

/**
 * Compute decorations from diff rows and JSON texts.
 * Builds position maps once (not per-row) to avoid O(rows × json_size) hang.
 */
export function computeDecorations(
  rows: DiffRow[],
  leftText: string,
  rightText: string
): { leftDecorations: DiffDecoration[]; rightDecorations: DiffDecoration[] } {
  if (rows.length === 0) return { leftDecorations: [], rightDecorations: [] };

  const leftDecorations: DiffDecoration[] = [];
  const rightDecorations: DiffDecoration[] = [];

  // Build position maps once per text (cached across calls)
  const leftPositions = getPositionMap(leftText);
  const rightPositions = getPositionMap(rightText);

  rows.forEach((row) => {
    if (row.type === 'removed' || row.type === 'changed') {
      const match = leftPositions.find((p) => p.path === row.path);
      if (match) {
        const range = offsetToLineColumn(
          leftText,
          match.startOffset,
          match.endOffset
        );
        leftDecorations.push({ path: row.path, ...range, type: row.type });
      }
    }

    if (row.type === 'added' || row.type === 'changed') {
      const match = rightPositions.find((p) => p.path === row.path);
      if (match) {
        const range = offsetToLineColumn(
          rightText,
          match.startOffset,
          match.endOffset
        );
        rightDecorations.push({ path: row.path, ...range, type: row.type });
      }
    }
  });

  return { leftDecorations, rightDecorations };
}

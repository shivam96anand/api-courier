/**
 * Pure functions for mapping jsondiffpatch deltas to diff rows and decorations
 */

import type { DiffRow, DiffDecoration, DiffChangeType } from '../types';

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
  return '/' + pathSegments.map(seg => seg.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

/**
 * Builds flat list of diff rows from jsondiffpatch delta
 */
export function buildDiffRows(delta: Delta | undefined, basePath: string[] = []): DiffRow[] {
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
    const pathKey = (isArrayDelta && key.startsWith('_') && !isNaN(Number(key.slice(1))))
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
        rows.push({ path: pathStr, type: 'changed', leftValue: value[0], rightValue: value[1] });
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
 * Approximate text range finder using simple offset-based search
 * Not perfect but fast enough for large JSONs
 */
export function findTextRangeForPath(
  jsonText: string,
  path: string
): { startLine: number; startColumn: number; endLine: number; endColumn: number } | null {
  const pathSegments = path === '' ? [] : path.slice(1).split('/').map(seg =>
    seg.replace(/~1/g, '/').replace(/~0/g, '~')
  );

  if (pathSegments.length === 0) {
    // Root - entire document
    const lines = jsonText.split('\n');
    return { startLine: 1, startColumn: 1, endLine: lines.length, endColumn: lines[lines.length - 1].length + 1 };
  }

  // Build a simple position map
  const positions = buildPositionMap(jsonText);

  // Find matching path
  const match = positions.find(p => p.path === path);
  if (!match) return null;

  return offsetToLineColumn(jsonText, match.startOffset, match.endOffset);
}

/**
 * Build approximate position map for JSON keys/values
 */
function buildPositionMap(jsonText: string): PathPosition[] {
  const positions: PathPosition[] = [];
  const stack: string[] = [];
  let i = 0;

  try {
    const parsed = JSON.parse(jsonText);
    traverseWithOffsets(parsed, jsonText, stack, positions);
  } catch {
    // Invalid JSON - return empty
    return [];
  }

  return positions;
}

function traverseWithOffsets(obj: unknown, text: string, stack: string[], positions: PathPosition[]): void {
  if (typeof obj !== 'object' || obj === null) return;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      stack.push(String(idx));
      const path = toJsonPointer(stack);
      // Approximate: find index in text
      const valueStr = JSON.stringify(item);
      const offset = text.indexOf(valueStr);
      if (offset >= 0) {
        positions.push({ path, startOffset: offset, endOffset: offset + valueStr.length });
      }
      traverseWithOffsets(item, text, stack, positions);
      stack.pop();
    });
  } else {
    Object.keys(obj).forEach(key => {
      stack.push(key);
      const path = toJsonPointer(stack);
      const value = (obj as Record<string, unknown>)[key];

      // Find key position (approximate)
      const keyPattern = `"${key}"`;
      let searchStart = 0;
      for (let depth = 0; depth < stack.length - 1; depth++) searchStart = text.indexOf('{', searchStart) + 1;
      const keyOffset = text.indexOf(keyPattern, searchStart);

      if (keyOffset >= 0) {
        const valueStr = JSON.stringify(value);
        const valueOffset = text.indexOf(valueStr, keyOffset);
        if (valueOffset >= 0) {
          positions.push({ path, startOffset: valueOffset, endOffset: valueOffset + valueStr.length });
        }
      }

      traverseWithOffsets(value, text, stack, positions);
      stack.pop();
    });
  }
}

function offsetToLineColumn(
  text: string,
  startOffset: number,
  endOffset: number
): { startLine: number; startColumn: number; endLine: number; endColumn: number } {
  let line = 1;
  let col = 1;
  let startLine = 1, startColumn = 1, endLine = 1, endColumn = 1;

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

  // Build position maps once per text, not once per row
  const leftPositions = buildPositionMap(leftText);
  const rightPositions = buildPositionMap(rightText);

  rows.forEach(row => {
    if (row.type === 'removed' || row.type === 'changed') {
      const match = leftPositions.find(p => p.path === row.path);
      if (match) {
        const range = offsetToLineColumn(leftText, match.startOffset, match.endOffset);
        leftDecorations.push({ path: row.path, ...range, type: row.type });
      }
    }

    if (row.type === 'added' || row.type === 'changed') {
      const match = rightPositions.find(p => p.path === row.path);
      if (match) {
        const range = offsetToLineColumn(rightText, match.startOffset, match.endOffset);
        rightDecorations.push({ path: row.path, ...range, type: row.type });
      }
    }
  });

  return { leftDecorations, rightDecorations };
}

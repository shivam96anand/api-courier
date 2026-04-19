/**
 * Export helpers for diff results.
 */

import type { DiffRow } from '../types';

export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

/** Convert diff rows to RFC 6902 JSON Patch operations. */
export function diffRowsToJsonPatch(rows: DiffRow[]): JsonPatchOp[] {
  return rows.map((row) => {
    if (row.type === 'added') {
      return { op: 'add', path: row.path, value: row.rightValue };
    }
    if (row.type === 'removed') {
      return { op: 'remove', path: row.path };
    }
    return { op: 'replace', path: row.path, value: row.rightValue };
  });
}

function fmtValue(v: unknown): string {
  if (v === undefined) return '_(empty)_';
  try {
    const s = JSON.stringify(v);
    if (s.length > 80) return '`' + s.slice(0, 77) + '…`';
    return '`' + s + '`';
  } catch {
    return '`' + String(v) + '`';
  }
}

/** Convert diff rows to a Markdown table for pasting into tickets/PRs. */
export function diffRowsToMarkdown(
  rows: DiffRow[],
  meta?: { leftLabel?: string; rightLabel?: string }
): string {
  const left = meta?.leftLabel || 'Left';
  const right = meta?.rightLabel || 'Right';
  const header =
    `| Path | Change | ${left} | ${right} |\n` + `| --- | --- | --- | --- |\n`;
  if (rows.length === 0) return header + '| _(no differences)_ |  |  |  |\n';
  return (
    header +
    rows
      .map(
        (r) =>
          `| \`${r.path || '/'}\` | ${r.type} | ${fmtValue(r.leftValue)} | ${fmtValue(r.rightValue)} |`
      )
      .join('\n') +
    '\n'
  );
}

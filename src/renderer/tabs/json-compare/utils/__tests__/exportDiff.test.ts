import { describe, it, expect } from 'vitest';
import { diffRowsToJsonPatch, diffRowsToMarkdown } from '../exportDiff';
import type { DiffRow } from '../../types';

const rows: DiffRow[] = [
  { path: '/a', type: 'added', rightValue: 1 },
  { path: '/b', type: 'removed', leftValue: 'old' },
  { path: '/c', type: 'changed', leftValue: 1, rightValue: 2 },
];

describe('exportDiff', () => {
  describe('diffRowsToJsonPatch', () => {
    it('maps to RFC 6902 ops', () => {
      expect(diffRowsToJsonPatch(rows)).toEqual([
        { op: 'add', path: '/a', value: 1 },
        { op: 'remove', path: '/b' },
        { op: 'replace', path: '/c', value: 2 },
      ]);
    });
  });

  describe('diffRowsToMarkdown', () => {
    it('renders a header + rows', () => {
      const md = diffRowsToMarkdown(rows);
      expect(md).toContain('| Path | Change | Left | Right |');
      expect(md).toContain('`/a`');
      expect(md).toContain('added');
      expect(md).toContain('removed');
      expect(md).toContain('changed');
    });

    it('honours custom labels', () => {
      const md = diffRowsToMarkdown(rows, {
        leftLabel: 'Prod',
        rightLabel: 'Stage',
      });
      expect(md).toContain('| Prod | Stage |');
    });

    it('handles empty rows', () => {
      const md = diffRowsToMarkdown([]);
      expect(md).toContain('_(no differences)_');
    });
  });
});

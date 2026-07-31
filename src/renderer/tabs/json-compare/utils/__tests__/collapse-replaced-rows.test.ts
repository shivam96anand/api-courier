import { describe, expect, it } from 'vitest';
import { buildDiffRows, collapseReplacedRows } from '../diffMap';
import type { DiffRow } from '../../types';

describe('diffMap.ts — collapseReplacedRows', () => {
  it('folds an add and a remove at the same path into one changed row', () => {
    const rows: DiffRow[] = [
      { path: '/tags/1', type: 'added', rightValue: 'c' },
      { path: '/tags/1', type: 'removed', leftValue: 'b' },
    ];
    expect(collapseReplacedRows(rows)).toEqual([
      { path: '/tags/1', type: 'changed', leftValue: 'b', rightValue: 'c' },
    ]);
  });

  it('leaves a lone addition untouched', () => {
    const rows: DiffRow[] = [
      { path: '/extra', type: 'added', rightValue: true },
    ];
    expect(collapseReplacedRows(rows)).toEqual(rows);
  });

  it('leaves a lone removal untouched', () => {
    const rows: DiffRow[] = [
      { path: '/nested/y', type: 'removed', leftValue: 2 },
    ];
    expect(collapseReplacedRows(rows)).toEqual(rows);
  });

  it('does not merge changes at different paths', () => {
    const rows: DiffRow[] = [
      { path: '/a', type: 'added', rightValue: 1 },
      { path: '/b', type: 'removed', leftValue: 2 },
    ];
    expect(collapseReplacedRows(rows)).toHaveLength(2);
  });

  it('keeps an existing changed row as-is', () => {
    const rows: DiffRow[] = [
      { path: '/version', type: 'changed', leftValue: 1, rightValue: 2 },
    ];
    expect(collapseReplacedRows(rows)).toEqual(rows);
  });
});

describe('diffMap.ts — buildDiffRows array replacement', () => {
  it('reports an array element replacement as a single changed row', () => {
    // jsondiffpatch array delta: index 1 deleted, index 1 added.
    const delta = {
      _t: 'a',
      1: ['c'],
      _1: ['b', 0, 0],
    };
    const rows = buildDiffRows(delta as never, []);
    const atIndex1 = rows.filter((r) => r.path === '/1');
    expect(atIndex1).toHaveLength(1);
    expect(atIndex1[0].type).toBe('changed');
    expect(atIndex1[0].leftValue).toBe('b');
    expect(atIndex1[0].rightValue).toBe('c');
  });

  it('still reports genuine insertions and deletions separately', () => {
    const delta = {
      _t: 'a',
      2: ['newItem'],
      _0: ['goneItem', 0, 0],
    };
    const rows = buildDiffRows(delta as never, []);
    expect(rows.find((r) => r.path === '/2')?.type).toBe('added');
    expect(rows.find((r) => r.path === '/0')?.type).toBe('removed');
  });
});

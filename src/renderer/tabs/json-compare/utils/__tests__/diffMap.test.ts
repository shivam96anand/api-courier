import { describe, it, expect } from 'vitest';
import {
  toJsonPointer,
  buildDiffRows,
  findTextRangeForPath,
  computeDecorations,
} from '../../utils/diffMap';

describe('toJsonPointer', () => {
  it('returns empty string for empty path', () => {
    expect(toJsonPointer([])).toBe('');
  });

  it('builds single-segment pointer', () => {
    expect(toJsonPointer(['name'])).toBe('/name');
  });

  it('builds multi-segment pointer', () => {
    expect(toJsonPointer(['a', 'b', 'c'])).toBe('/a/b/c');
  });

  it('escapes ~ as ~0', () => {
    expect(toJsonPointer(['a~b'])).toBe('/a~0b');
  });

  it('escapes / as ~1', () => {
    expect(toJsonPointer(['a/b'])).toBe('/a~1b');
  });

  it('applies escaping in correct order (~ before /)', () => {
    expect(toJsonPointer(['a~/b'])).toBe('/a~0~1b');
  });
});

describe('buildDiffRows', () => {
  it('returns empty array for undefined delta', () => {
    expect(buildDiffRows(undefined)).toEqual([]);
  });

  it('returns empty array for empty delta', () => {
    expect(buildDiffRows({})).toEqual([]);
  });

  it('detects added values (single-element array)', () => {
    const delta = { name: ['John'] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      path: '/name',
      type: 'added',
      rightValue: 'John',
    });
  });

  it('detects removed values ([old, 0, 0])', () => {
    const delta = { age: [25, 0, 0] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      path: '/age',
      type: 'removed',
      leftValue: 25,
    });
  });

  it('detects changed values ([old, new])', () => {
    const delta = { status: ['active', 'inactive'] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      path: '/status',
      type: 'changed',
      leftValue: 'active',
      rightValue: 'inactive',
    });
  });

  it('handles nested object deltas (recursion)', () => {
    const delta = { user: { name: ['Alice', 'Bob'] } };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe('/user/name');
    expect(rows[0].type).toBe('changed');
  });

  it('handles text diff format [patch, 0, 2]', () => {
    const delta = { description: ['some diff patch', 0, 2] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('changed');
    expect(rows[0].path).toBe('/description');
  });

  it('skips array move operations ([value, newIdx, 3])', () => {
    const delta = { _t: 'a', _0: ['', 2, 3] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(0);
  });

  it('handles array delta with _t marker', () => {
    const delta = { _t: 'a', '0': ['new item'], _1: ['removed', 0, 0] };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(2);

    const added = rows.find((r) => r.type === 'added');
    expect(added).toBeDefined();
    expect(added!.path).toBe('/0');

    const removed = rows.find((r) => r.type === 'removed');
    expect(removed).toBeDefined();
    // _1 → path segment "1" (leading _ stripped for array deltas)
    expect(removed!.path).toBe('/1');
  });

  it('skips _t meta key', () => {
    const delta = { _t: 'a' };
    const rows = buildDiffRows(delta);
    expect(rows).toHaveLength(0);
  });

  it('uses basePath to prefix paths', () => {
    const delta = { x: [1] };
    const rows = buildDiffRows(delta, ['root']);
    expect(rows[0].path).toBe('/root/x');
  });
});

describe('findTextRangeForPath', () => {
  const json = `{
  "name": "Alice",
  "age": 30
}`;

  it('returns full document range for root path', () => {
    const range = findTextRangeForPath(json, '');
    expect(range).not.toBeNull();
    expect(range!.startLine).toBe(1);
    expect(range!.endLine).toBe(4);
  });

  it('finds range for top-level key', () => {
    const range = findTextRangeForPath(json, '/name');
    expect(range).not.toBeNull();
    expect(range!.startLine).toBe(2);
  });

  it('returns null for non-matching path', () => {
    const range = findTextRangeForPath(json, '/nonexistent');
    expect(range).toBeNull();
  });

  it('works with nested objects', () => {
    const nested = '{"a":{"b":"c"}}';
    const range = findTextRangeForPath(nested, '/a/b');
    expect(range).not.toBeNull();
  });

  it('works with arrays', () => {
    const arr = '{"items":["x","y","z"]}';
    const range = findTextRangeForPath(arr, '/items/1');
    expect(range).not.toBeNull();
  });

  it('returns empty for invalid JSON', () => {
    const range = findTextRangeForPath('not json', '/foo');
    expect(range).toBeNull();
  });
});

describe('computeDecorations', () => {
  it('returns empty decorations for no rows', () => {
    const { leftDecorations, rightDecorations } = computeDecorations(
      [],
      '{}',
      '{}'
    );
    expect(leftDecorations).toEqual([]);
    expect(rightDecorations).toEqual([]);
  });

  it('creates left decoration for removed row', () => {
    const leftJson = '{"name":"Alice"}';
    const rightJson = '{}';
    const rows = [{ path: '/name', type: 'removed' as const, leftValue: 'Alice' }];

    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );
    expect(leftDecorations).toHaveLength(1);
    expect(leftDecorations[0].type).toBe('removed');
    expect(rightDecorations).toHaveLength(0);
  });

  it('creates right decoration for added row', () => {
    const leftJson = '{}';
    const rightJson = '{"name":"Bob"}';
    const rows = [{ path: '/name', type: 'added' as const, rightValue: 'Bob' }];

    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );
    expect(rightDecorations).toHaveLength(1);
    expect(rightDecorations[0].type).toBe('added');
    expect(leftDecorations).toHaveLength(0);
  });

  it('creates both decorations for changed row', () => {
    const leftJson = '{"x":1}';
    const rightJson = '{"x":2}';
    const rows = [
      {
        path: '/x',
        type: 'changed' as const,
        leftValue: 1,
        rightValue: 2,
      },
    ];

    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );
    expect(leftDecorations).toHaveLength(1);
    expect(rightDecorations).toHaveLength(1);
    expect(leftDecorations[0].type).toBe('changed');
    expect(rightDecorations[0].type).toBe('changed');
  });

  it('skips rows whose paths are not found in JSON', () => {
    const leftJson = '{}';
    const rightJson = '{}';
    const rows = [{ path: '/missing', type: 'changed' as const }];

    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );
    expect(leftDecorations).toHaveLength(0);
    expect(rightDecorations).toHaveLength(0);
  });

  it('handles multiple rows efficiently', () => {
    const leftJson = '{"a":1,"b":2,"c":3}';
    const rightJson = '{"a":10,"b":20,"d":4}';
    const rows = [
      { path: '/a', type: 'changed' as const, leftValue: 1, rightValue: 10 },
      { path: '/b', type: 'changed' as const, leftValue: 2, rightValue: 20 },
      { path: '/c', type: 'removed' as const, leftValue: 3 },
      { path: '/d', type: 'added' as const, rightValue: 4 },
    ];

    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );
    // left: /a (changed), /b (changed), /c (removed) = 3
    expect(leftDecorations).toHaveLength(3);
    // right: /a (changed), /b (changed), /d (added) = 3
    expect(rightDecorations).toHaveLength(3);
  });
});

/**
 * Regression tests for variable-resolution defects found during QA.
 *
 * 1. `{{constructor}}` / `{{toString}}` / `{{__proto__}}` used to resolve to
 *    JavaScript internals because lookup used `name in map`, which walks the
 *    prototype chain.
 * 2. A collection tree whose `parentId` forms a cycle used to loop forever in
 *    `buildFolderVars` and crash with `RangeError: Invalid array length`.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTemplate,
  scanUnresolvedVars,
  buildFolderVars,
} from '../variables';

const PROTOTYPE_NAMES = [
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
];

describe('resolveTemplate — inherited property names', () => {
  it.each(PROTOTYPE_NAMES)(
    'leaves {{%s}} untouched when no such variable is defined',
    (name) => {
      expect(resolveTemplate(`https://api.dev/${name}/{{${name}}}`)).toBe(
        `https://api.dev/${name}/{{${name}}}`
      );
    }
  );

  it('does not leak Object.prototype values through any variable source', () => {
    const out = resolveTemplate('{{constructor}}|{{toString}}|{{valueOf}}', {
      requestVars: {},
      envVars: {},
      folderVars: {},
      globalVars: {},
      systemVars: {},
    });
    expect(out).not.toMatch(/native code/);
    expect(out).toBe('{{constructor}}|{{toString}}|{{valueOf}}');
  });

  it('still resolves a variable the user actually named "constructor"', () => {
    expect(
      resolveTemplate('{{constructor}}', { envVars: { constructor: 'mine' } })
    ).toBe('mine');
  });

  it('applies the default value for an inherited-looking name', () => {
    expect(resolveTemplate('{{toString:fallback}}')).toBe('fallback');
  });

  it('reports inherited-looking names as unresolved', () => {
    expect(scanUnresolvedVars('{{constructor}}')).toEqual(['constructor']);
  });
});

describe('buildFolderVars — corrupt collection trees', () => {
  it('terminates when parentId forms a two-node cycle', () => {
    const collections = [
      { id: 'a', parentId: 'b', type: 'folder', variables: { x: '1' } },
      { id: 'b', parentId: 'a', type: 'folder', variables: { y: '2' } },
    ];
    expect(buildFolderVars('a', collections)).toEqual({ x: '1', y: '2' });
  });

  it('terminates when a folder is its own parent', () => {
    const collections = [
      { id: 'a', parentId: 'a', type: 'folder', variables: { x: '1' } },
    ];
    expect(buildFolderVars('a', collections)).toEqual({ x: '1' });
  });

  it('still walks a normal ancestor chain child-overrides-parent', () => {
    const collections = [
      { id: 'root', type: 'folder', variables: { host: 'root', a: '1' } },
      {
        id: 'child',
        parentId: 'root',
        type: 'folder',
        variables: { host: 'child' },
      },
    ];
    expect(buildFolderVars('child', collections)).toEqual({
      host: 'child',
      a: '1',
    });
  });
});

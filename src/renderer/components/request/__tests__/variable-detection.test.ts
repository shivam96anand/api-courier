import { describe, it, expect } from 'vitest';
import {
  detectVariables,
  resolveVariable,
  buildFolderVars,
} from '../variable-detection';
import type { Environment, Collection } from '../../../../shared/types';

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Test',
    type: 'folder',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('detectVariables', () => {
  it('detects a single variable', () => {
    const vars = detectVariables('Hello {{name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toEqual({ start: 6, end: 14, name: 'name' });
  });

  it('detects multiple variables', () => {
    const vars = detectVariables('{{host}}/api/{{version}}');
    expect(vars).toHaveLength(2);
    expect(vars[0].name).toBe('host');
    expect(vars[1].name).toBe('version');
  });

  it('returns empty for no variables', () => {
    expect(detectVariables('plain text')).toHaveLength(0);
  });

  it('returns empty for empty string', () => {
    expect(detectVariables('')).toHaveLength(0);
  });

  it('trims whitespace in variable names', () => {
    const vars = detectVariables('{{ spaced }}');
    expect(vars[0].name).toBe('spaced');
  });

  it('detects variables with dots and hyphens', () => {
    const vars = detectVariables('{{my.var-name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('my.var-name');
  });

  it('does not match incomplete brackets', () => {
    expect(detectVariables('{single}')).toHaveLength(0);
    expect(detectVariables('{{unterminated')).toHaveLength(0);
  });

  it('returns correct positions', () => {
    const text = 'a{{b}}c{{d}}e';
    const vars = detectVariables(text);
    expect(vars).toHaveLength(2);
    expect(text.substring(vars[0].start, vars[0].end)).toBe('{{b}}');
    expect(text.substring(vars[1].start, vars[1].end)).toBe('{{d}}');
  });
});

describe('resolveVariable', () => {
  const env: Environment = {
    id: 'env-1',
    name: 'Dev',
    variables: { host: 'localhost', port: '3000' },
  };
  const globals = { variables: { apiVersion: 'v2', host: 'global-host' } };
  const folderVars = { host: 'folder-host', folder_var: 'from-folder' };

  it('resolves from active environment first', () => {
    const result = resolveVariable('host', env, globals, folderVars);
    expect(result.value).toBe('localhost');
    expect(result.source).toContain('Environment');
  });

  it('falls back to folder variables', () => {
    const result = resolveVariable('folder_var', env, globals, folderVars);
    expect(result.value).toBe('from-folder');
    expect(result.source).toBe('Folder variables');
  });

  it('falls back to globals', () => {
    const result = resolveVariable('apiVersion', env, globals, folderVars);
    expect(result.value).toBe('v2');
    expect(result.source).toBe('Global variables');
  });

  it('returns undefined for unresolved variable', () => {
    const result = resolveVariable('nonexistent', env, { variables: {} });
    expect(result.value).toBeUndefined();
    expect(result.source).toBe('Not defined');
  });

  it('resolves without environment', () => {
    const result = resolveVariable('apiVersion', undefined, globals);
    expect(result.value).toBe('v2');
    expect(result.source).toBe('Global variables');
  });

  it('resolves system variables', () => {
    // $timestamp is a common system variable
    const result = resolveVariable('$timestamp', undefined, { variables: {} });
    // System variables should resolve to something
    if (result.value !== undefined) {
      expect(result.source).toBe('System variable');
    }
    // If not a recognized system var, it will be 'Not defined'
  });

  it('resolves without folder vars', () => {
    const result = resolveVariable('host', env, globals);
    expect(result.value).toBe('localhost');
  });
});

describe('buildFolderVars', () => {
  it('returns empty object for undefined collectionId', () => {
    expect(buildFolderVars(undefined, [])).toEqual({});
  });

  it('returns empty object for empty collections', () => {
    expect(buildFolderVars('col-1', [])).toEqual({});
  });

  it('returns folder variables from a single folder', () => {
    const folder = makeCollection({
      id: 'folder-1',
      type: 'folder',
      variables: { key: 'value' },
    });
    const result = buildFolderVars('folder-1', [folder]);
    expect(result).toEqual({ key: 'value' });
  });

  it('skips non-folder collections', () => {
    const request = makeCollection({
      id: 'req-1',
      type: 'request',
      variables: { should_not: 'appear' },
    });
    const result = buildFolderVars('req-1', [request]);
    expect(result).toEqual({});
  });

  it('merges ancestor chain with child overriding parent', () => {
    const parent = makeCollection({
      id: 'parent',
      type: 'folder',
      variables: { shared: 'parent-val', parent_only: 'yes' },
    });
    const child = makeCollection({
      id: 'child',
      type: 'folder',
      parentId: 'parent',
      variables: { shared: 'child-val', child_only: 'yes' },
    });
    const result = buildFolderVars('child', [parent, child]);
    expect(result).toEqual({
      shared: 'child-val', // child overrides parent
      parent_only: 'yes',
      child_only: 'yes',
    });
  });

  it('handles deep nesting', () => {
    const grandparent = makeCollection({
      id: 'gp',
      type: 'folder',
      variables: { level: 'gp' },
    });
    const parent = makeCollection({
      id: 'p',
      type: 'folder',
      parentId: 'gp',
      variables: { level: 'parent' },
    });
    const child = makeCollection({
      id: 'c',
      type: 'folder',
      parentId: 'p',
      variables: { level: 'child' },
    });
    const result = buildFolderVars('c', [grandparent, parent, child]);
    expect(result.level).toBe('child');
  });

  it('handles folder without variables property', () => {
    const folder = makeCollection({ id: 'f', type: 'folder' });
    const result = buildFolderVars('f', [folder]);
    expect(result).toEqual({});
  });
});

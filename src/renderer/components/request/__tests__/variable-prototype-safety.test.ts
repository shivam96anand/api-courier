/**
 * Regression tests: the renderer-side resolvers (used for the URL preview,
 * cURL preview and code snippets) had the same prototype-chain leak as the
 * main-process resolver, so `{{constructor}}` rendered as
 * `function Object() { [native code] }` in the preview.
 */
import { describe, it, expect } from 'vitest';
import { resolveTemplate } from '../request-variable-resolver';
import { resolveVariable, buildFolderVars } from '../variable-detection';
import { Collection, Environment } from '../../../../shared/types';

const emptySources = {
  requestVars: {},
  folderVars: {},
  envVars: {},
  globalVars: {},
};

describe('renderer resolveTemplate — inherited property names', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'leaves {{%s}} untouched',
    (name) => {
      expect(resolveTemplate(`{{${name}}}`, emptySources)).toBe(`{{${name}}}`);
    }
  );

  it('does not render JS internals into the URL preview', () => {
    const out = resolveTemplate(
      'https://example.com/{{constructor}}/{{toString}}',
      emptySources
    );
    expect(out).not.toMatch(/native code/);
  });

  it('still resolves a real variable named "constructor"', () => {
    expect(
      resolveTemplate('{{constructor}}', {
        ...emptySources,
        envVars: { constructor: 'ok' },
      })
    ).toBe('ok');
  });
});

describe('resolveVariable — inherited property names', () => {
  const env = { id: 'e', name: 'Dev', variables: {} } as Environment;

  it.each(['constructor', 'toString', 'valueOf'])(
    'reports %s as undefined rather than a JS internal',
    (name) => {
      const result = resolveVariable(name, env, { variables: {} }, {});
      expect(result.value).toBeUndefined();
    }
  );

  it('still resolves a real environment variable', () => {
    const result = resolveVariable(
      'host',
      { ...env, variables: { host: 'api.dev' } },
      { variables: {} },
      {}
    );
    expect(result.value).toBe('api.dev');
    expect(result.source).toBe('Environment: Dev');
  });
});

describe('renderer buildFolderVars — corrupt collection trees', () => {
  it('terminates on a parentId cycle', () => {
    const collections = [
      {
        id: 'a',
        name: 'a',
        parentId: 'b',
        type: 'folder',
        variables: { x: '1' },
      },
      {
        id: 'b',
        name: 'b',
        parentId: 'a',
        type: 'folder',
        variables: { y: '2' },
      },
    ] as unknown as Collection[];
    expect(buildFolderVars('a', collections)).toEqual({ x: '1', y: '2' });
  });
});

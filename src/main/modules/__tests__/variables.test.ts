import { describe, expect, it } from 'vitest';
import {
  buildFolderVars,
  composeFinalRequest,
  resolveKeyValueArray,
  resolveObject,
  resolveParamsOrHeaders,
  resolveTemplate,
  scanUnresolvedVars,
} from '../variables';

describe('variables.ts', () => {
  describe('resolveTemplate', () => {
    it('resolves variables using source precedence and defaults', () => {
      const result = resolveTemplate(
        '{{shared}} {{envOnly}} {{folderOnly}} {{globalOnly}} {{missing:fallback}} {{missing}}',
        {
          requestVars: { shared: 'request' },
          envVars: { shared: 'env', envOnly: 'env-value' },
          folderVars: { shared: 'folder', folderOnly: 'folder-value' },
          globalVars: { shared: 'global', globalOnly: 'global-value' },
        }
      );

      expect(result).toBe(
        'request env-value folder-value global-value fallback {{missing}}'
      );
    });

    it('resolves repeated placeholders and whitespace inside braces', () => {
      const result = resolveTemplate('{{ name }} -> {{name}}', {
        requestVars: { name: 'restbro' },
      });

      expect(result).toBe('restbro -> restbro');
    });

    it('supports nested resolution up to the default max depth', () => {
      const result = resolveTemplate('{{a}}', {
        requestVars: {
          a: '{{b}}',
          b: '{{c}}',
          c: 'done',
        },
      });

      expect(result).toBe('done');
    });

    it('stops resolving when maxDepth is reached', () => {
      const result = resolveTemplate('{{a}}', {
        requestVars: {
          a: '{{b}}',
          b: '{{c}}',
          c: 'done',
        },
        maxDepth: 2,
      });

      expect(result).toBe('{{c}}');
    });

    it('prevents infinite self-references from looping forever', () => {
      const result = resolveTemplate('{{loop}}', {
        requestVars: { loop: '{{loop}}' },
      });

      expect(result).toBe('{{loop}}');
    });

    it('URL-encodes resolved values when requested', () => {
      const encoded = resolveTemplate('{{term}}', {
        requestVars: { term: 'hello world/yes' },
        urlEncodeValues: true,
      });
      const plain = resolveTemplate('{{term}}', {
        requestVars: { term: 'hello world/yes' },
      });

      expect(encoded).toBe('hello%20world%2Fyes');
      expect(plain).toBe('hello world/yes');
    });

    it('handles nullish, empty, and plain string input gracefully', () => {
      expect(resolveTemplate(undefined as unknown as string)).toBe('');
      expect(resolveTemplate(null as unknown as string)).toBe('');
      expect(resolveTemplate('')).toBe('');
      expect(resolveTemplate('plain text')).toBe('plain text');
    });
  });

  describe('buildFolderVars', () => {
    const collections = [
      {
        id: 'root',
        type: 'folder',
        variables: { shared: 'root', rootOnly: 'root' },
      },
      {
        id: 'parent',
        type: 'folder',
        parentId: 'root',
        variables: { shared: 'parent', parentOnly: 'parent' },
      },
      {
        id: 'child',
        type: 'folder',
        parentId: 'parent',
        variables: { shared: 'child', childOnly: 'child' },
      },
      {
        id: 'request',
        type: 'request',
        parentId: 'child',
        variables: { ignored: 'request-var' },
      },
    ];

    it('returns an empty object when no collection id is provided or found', () => {
      expect(buildFolderVars(undefined, collections)).toEqual({});
      expect(buildFolderVars('missing', collections)).toEqual({});
    });

    it('merges ancestor folder variables from root to child', () => {
      expect(buildFolderVars('child', collections)).toEqual({
        shared: 'child',
        rootOnly: 'root',
        parentOnly: 'parent',
        childOnly: 'child',
      });
    });

    it('ignores variables on request items while still walking folder ancestors', () => {
      expect(buildFolderVars('request', collections)).toEqual({
        shared: 'child',
        rootOnly: 'root',
        parentOnly: 'parent',
        childOnly: 'child',
      });
    });

    it('stops traversal cleanly when a parent folder is missing', () => {
      expect(
        buildFolderVars('orphan', [
          {
            id: 'orphan',
            type: 'folder',
            parentId: 'missing-parent',
            variables: { only: 'value' },
          },
        ])
      ).toEqual({ only: 'value' });
    });
  });

  describe('resolveObject', () => {
    it('resolves template placeholders in keys and values', () => {
      expect(
        resolveObject(
          {
            'X-{{scope}}': '{{token}}',
            static: 'plain',
          },
          {
            envVars: { scope: 'Env' },
            requestVars: { token: 'secret' },
          }
        )
      ).toEqual({
        'X-Env': 'secret',
        static: 'plain',
      });
    });

    it('returns an empty object unchanged', () => {
      expect(resolveObject({})).toEqual({});
    });
  });

  describe('resolveKeyValueArray', () => {
    it('resolves key/value placeholders and preserves enabled flags', () => {
      expect(
        resolveKeyValueArray(
          [
            { key: 'X-{{name}}', value: '{{value}}', enabled: true },
            { key: 'Static', value: 'plain', enabled: false },
          ],
          {
            requestVars: { name: 'Trace', value: '123' },
          }
        )
      ).toEqual([
        { key: 'X-Trace', value: '123', enabled: true },
        { key: 'Static', value: 'plain', enabled: false },
      ]);
    });

    it('returns an empty array unchanged', () => {
      expect(resolveKeyValueArray([])).toEqual([]);
    });
  });

  describe('scanUnresolvedVars', () => {
    it('returns an empty array when all placeholders resolve', () => {
      expect(
        scanUnresolvedVars('https://{{host}}/{{path}}', {
          envVars: { host: 'example.com', path: 'users' },
        })
      ).toEqual([]);
    });

    it('returns unresolved variable names that remain after resolution', () => {
      expect(
        scanUnresolvedVars('{{known}} {{missingOne}} {{missingTwo}}', {
          requestVars: { known: 'value' },
        })
      ).toEqual(['missingOne', 'missingTwo']);
    });

    it('does not report variables that fall back to defaults', () => {
      expect(scanUnresolvedVars('{{missing:fallback}}')).toEqual([]);
    });

    it('returns an empty array for strings without placeholders', () => {
      expect(scanUnresolvedVars('plain text')).toEqual([]);
    });
  });

  describe('resolveParamsOrHeaders', () => {
    it('resolves an array of KeyValuePairs', () => {
      expect(
        resolveParamsOrHeaders(
          [{ key: '{{k}}', value: '{{v}}', enabled: true }],
          { requestVars: { k: 'Host', v: 'example.com' } }
        )
      ).toEqual([{ key: 'Host', value: 'example.com', enabled: true }]);
    });

    it('resolves a Record<string, string>', () => {
      expect(
        resolveParamsOrHeaders(
          { '{{k}}': '{{v}}' },
          {
            requestVars: { k: 'Host', v: 'example.com' },
          }
        )
      ).toEqual({ Host: 'example.com' });
    });

    it('returns empty object for undefined input', () => {
      expect(resolveParamsOrHeaders(undefined)).toEqual({});
    });
  });

  describe('composeFinalRequest', () => {
    it('resolves all variable placeholders in a request', () => {
      const request = {
        url: 'https://{{host}}/{{path}}',
        params: { page: '{{page}}' },
        headers: { Authorization: 'Bearer {{token}}' },
        body: { type: 'json', content: '{"name":"{{name}}"}' },
        variables: {},
      };

      const env = {
        variables: { host: 'api.example.com', path: 'users', token: 'abc123' },
      };
      const globals = { variables: { page: '1', name: 'John' } };

      const result = composeFinalRequest(request, env, globals);

      expect(result.url).toBe('https://api.example.com/users');
      expect(result.headers).toEqual({ Authorization: 'Bearer abc123' });
      expect(result.body?.content).toBe('{"name":"John"}');
    });

    it('applies variable precedence: request > env > folder > global', () => {
      const request = {
        url: '{{shared}}',
        params: {},
        headers: {},
        variables: { shared: 'from-request' },
      };

      const env = { variables: { shared: 'from-env' } };
      const globals = { variables: { shared: 'from-global' } };
      const folderVars = { shared: 'from-folder' };

      const result = composeFinalRequest(request, env, globals, folderVars);
      expect(result.url).toBe('from-request');
    });

    it('resolves auth config variables', () => {
      const request = {
        url: 'https://api.example.com',
        params: {},
        headers: {},
        auth: {
          type: 'bearer',
          config: { token: '{{token}}' },
        },
      };

      const env = { variables: { token: 'resolved-token' } };
      const result = composeFinalRequest(request, env);
      expect(result.auth.config.token).toBe('resolved-token');
    });

    it('returns body unchanged when content is empty', () => {
      const request = {
        url: 'https://api.example.com',
        params: {},
        headers: {},
        body: { type: 'none', content: '' },
      };

      const result = composeFinalRequest(request);
      expect(result.body?.content).toBe('');
    });

    it('handles request with no env, globals, or folder vars', () => {
      const request = {
        url: 'https://api.example.com/static',
        params: {},
        headers: { Accept: 'application/json' },
      };

      const result = composeFinalRequest(request);
      expect(result.url).toBe('https://api.example.com/static');
      expect(result.headers).toEqual({ Accept: 'application/json' });
    });
  });
});

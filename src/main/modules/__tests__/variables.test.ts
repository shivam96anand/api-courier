import { describe, it, expect } from 'vitest';
import {
  resolveTemplate,
  resolveObject,
  scanUnresolvedVars,
  composeFinalRequest,
  buildFolderVars,
  ResolveOptions,
} from '../variables';

describe('Variable Resolution Engine', () => {
  describe('resolveTemplate', () => {
    it('should resolve simple variables', () => {
      const result = resolveTemplate('https://{{host}}/api', {
        envVars: { host: 'example.com' },
      });
      expect(result).toBe('https://example.com/api');
    });

    it('should resolve multiple variables', () => {
      const result = resolveTemplate('{{protocol}}://{{host}}:{{port}}/{{path}}', {
        envVars: {
          protocol: 'https',
          host: 'api.example.com',
          port: '8080',
          path: 'v1/users',
        },
      });
      expect(result).toBe('https://api.example.com:8080/v1/users');
    });

    it('should use default values when variable not found', () => {
      const result = resolveTemplate('https://{{host:localhost}}/api', {
        envVars: {},
      });
      expect(result).toBe('https://localhost/api');
    });

    it('should respect precedence: request > env > folder > global', () => {
      const opts: ResolveOptions = {
        requestVars: { key: 'request' },
        folderVars: { key: 'folder' },
        envVars: { key: 'env' },
        globalVars: { key: 'global' },
      };
      expect(resolveTemplate('{{key}}', opts)).toBe('request');
    });

    it('should fallback through precedence chain', () => {
      expect(
        resolveTemplate('{{key}}', {
          envVars: { key: 'env' },
          globalVars: { key: 'global' },
        })
      ).toBe('env');

      expect(
        resolveTemplate('{{key}}', {
          globalVars: { key: 'global' },
        })
      ).toBe('global');
    });

    it('should handle nested variables', () => {
      const result = resolveTemplate('https://{{host_{{stage}}}}', {
        envVars: {
          stage: 'prod',
          host_prod: 'api.prod.com',
          host_dev: 'api.dev.com',
        },
      });
      expect(result).toBe('https://api.prod.com');
    });

    it('should handle deeply nested variables up to maxDepth', () => {
      const result = resolveTemplate('{{a}}', {
        envVars: {
          a: '{{b}}',
          b: '{{c}}',
          c: 'final',
        },
        maxDepth: 5,
      });
      expect(result).toBe('final');
    });

    it('should stop at maxDepth to prevent infinite loops', () => {
      const result = resolveTemplate('{{a}}', {
        envVars: {
          a: '{{b}}',
          b: '{{a}}', // circular reference
        },
        maxDepth: 3,
      });
      // Should still contain unresolved placeholder after maxDepth
      expect(result).toMatch(/{{[ab]}}/);
    });

    it('should preserve unresolved variables without defaults', () => {
      const result = resolveTemplate('https://{{host}}/{{path}}', {
        envVars: { host: 'example.com' },
      });
      expect(result).toBe('https://example.com/{{path}}');
    });

    it('should handle whitespace in variable syntax', () => {
      const result = resolveTemplate('{{ host }}/{{ path }}', {
        envVars: { host: 'example.com', path: 'api' },
      });
      expect(result).toBe('example.com/api');
    });

    it('should URL encode values when requested', () => {
      const result = resolveTemplate('{{key}}', {
        envVars: { key: 'hello world & more' },
        urlEncodeValues: true,
      });
      expect(result).toBe('hello%20world%20%26%20more');
    });

    it('should handle empty string values', () => {
      const result = resolveTemplate('{{prefix}}value', {
        envVars: { prefix: '' },
      });
      expect(result).toBe('value');
    });

    it('should handle variables with dashes and underscores', () => {
      const result = resolveTemplate('{{api-key}}/{{user_id}}', {
        envVars: { 'api-key': 'abc123', user_id: '456' },
      });
      expect(result).toBe('abc123/456');
    });
  });

  describe('resolveObject', () => {
    it('should resolve all values in object', () => {
      const result = resolveObject(
        {
          Authorization: 'Bearer {{token}}',
          'X-API-Key': '{{apiKey}}',
        },
        {
          envVars: { token: 'abc123', apiKey: 'xyz789' },
        }
      );
      expect(result).toEqual({
        Authorization: 'Bearer abc123',
        'X-API-Key': 'xyz789',
      });
    });

    it('should resolve variable names in keys', () => {
      const result = resolveObject(
        {
          '{{headerName}}': '{{headerValue}}',
        },
        {
          envVars: { headerName: 'X-Custom', headerValue: 'custom-value' },
        }
      );
      expect(result).toEqual({
        'X-Custom': 'custom-value',
      });
    });

    it('should handle empty object', () => {
      const result = resolveObject({}, { envVars: { key: 'value' } });
      expect(result).toEqual({});
    });
  });

  describe('scanUnresolvedVars', () => {
    it('should find unresolved variables', () => {
      const unresolved = scanUnresolvedVars('https://{{host}}/{{path}}', {
        envVars: { host: 'example.com' },
      });
      expect(unresolved).toContain('path');
      expect(unresolved).not.toContain('host');
    });

    it('should return empty array when all resolved', () => {
      const unresolved = scanUnresolvedVars('https://{{host}}/{{path}}', {
        envVars: { host: 'example.com', path: 'api' },
      });
      expect(unresolved).toEqual([]);
    });

    it('should handle variables with defaults', () => {
      const unresolved = scanUnresolvedVars('https://{{host:localhost}}', {
        envVars: {},
      });
      // Should not be unresolved because it has a default
      expect(unresolved).toEqual([]);
    });
  });

  describe('composeFinalRequest', () => {
    it('should resolve all request components', () => {
      const request = {
        url: 'https://{{host}}/users',
        params: { tenant: '{{tenant}}' },
        headers: { Authorization: 'Bearer {{token}}' },
        body: { type: 'json', content: '{"key":"{{value}}"}' },
        auth: {
          type: 'bearer',
          config: { token: '{{token}}' },
        },
        variables: {},
      };

      const result = composeFinalRequest(
        request,
        { variables: { host: 'api.example.com', tenant: 'acme', value: 'test' } },
        { variables: { token: 'global-token' } }
      );

      expect(result.url).toBe('https://api.example.com/users');
      expect(result.params).toEqual({ tenant: 'acme' });
      expect(result.headers).toEqual({ Authorization: 'Bearer global-token' });
      expect(result.body?.content).toBe('{"key":"test"}');
      expect(result.auth?.config.token).toBe('global-token');
    });

    it('should prioritize request variables over environment', () => {
      const request = {
        url: 'https://{{host}}/api',
        params: {},
        headers: {},
        variables: { host: 'request.example.com' },
      };

      const result = composeFinalRequest(
        request,
        { variables: { host: 'env.example.com' } },
        { variables: { host: 'global.example.com' } }
      );

      expect(result.url).toBe('https://request.example.com/api');
    });

    it('should URL encode param values', () => {
      const request = {
        url: 'https://example.com',
        params: { query: '{{searchTerm}}' },
        headers: {},
        variables: {},
      };

      const result = composeFinalRequest(request, { variables: { searchTerm: 'hello world' } });

      expect(result.params.query).toBe('hello%20world');
    });

    it('should handle missing optional fields', () => {
      const request = {
        url: 'https://example.com',
        params: {},
        headers: {},
      };

      const result = composeFinalRequest(request);

      expect(result.url).toBe('https://example.com');
      expect(result.params).toEqual({});
      expect(result.headers).toEqual({});
      expect(result.body).toBeUndefined();
      expect(result.auth).toBeUndefined();
    });
  });

  describe('folder-scoped variables', () => {
    it('should respect precedence: request > env > folder > global', () => {
      const opts: ResolveOptions = {
        requestVars: { key: 'request' },
        folderVars: { key: 'folder' },
        envVars: { key: 'env' },
        globalVars: { key: 'global' },
      };
      expect(resolveTemplate('{{key}}', opts)).toBe('request');
    });

    it('should fallback to folder vars when request and env vars not found', () => {
      const opts: ResolveOptions = {
        folderVars: { key: 'folder' },
        globalVars: { key: 'global' },
      };
      expect(resolveTemplate('{{key}}', opts)).toBe('folder');
    });

    it('should build folder vars from ancestor chain', () => {
      const collections = [
        {
          id: 'root',
          type: 'folder',
          variables: { api_url: 'https://api.example.com', version: 'v1' },
        },
        {
          id: 'child',
          type: 'folder',
          parentId: 'root',
          variables: { version: 'v2', tenant: 'acme' },
        },
        {
          id: 'grandchild',
          type: 'request',
          parentId: 'child',
        },
      ];

      const folderVars = buildFolderVars('grandchild', collections);

      // Child overrides parent for 'version', inherits 'api_url', adds 'tenant'
      expect(folderVars).toEqual({
        api_url: 'https://api.example.com',
        version: 'v2',
        tenant: 'acme',
      });
    });

    it('should return empty object when no collectionId provided', () => {
      const collections = [
        {
          id: 'folder',
          type: 'folder',
          variables: { key: 'value' },
        },
      ];

      const folderVars = buildFolderVars(undefined, collections);
      expect(folderVars).toEqual({});
    });

    it('should return empty object when collection not found', () => {
      const collections = [
        {
          id: 'folder',
          type: 'folder',
          variables: { key: 'value' },
        },
      ];

      const folderVars = buildFolderVars('non-existent', collections);
      expect(folderVars).toEqual({});
    });

    it('should handle request items without folder ancestors', () => {
      const collections = [
        {
          id: 'request1',
          type: 'request',
        },
      ];

      const folderVars = buildFolderVars('request1', collections);
      expect(folderVars).toEqual({});
    });

    it('should ignore request-type items in ancestor chain', () => {
      const collections = [
        {
          id: 'folder',
          type: 'folder',
          variables: { key: 'folderValue' },
        },
        {
          id: 'request',
          type: 'request',
          parentId: 'folder',
          variables: { key: 'requestValue' }, // request vars are ignored in folder chain
        },
      ];

      const folderVars = buildFolderVars('request', collections);

      // Only folder variables should be included
      expect(folderVars).toEqual({
        key: 'folderValue',
      });
    });

    it('should use folder vars in composeFinalRequest', () => {
      const request = {
        url: 'https://{{host}}/{{version}}/users',
        params: { tenant: '{{tenant}}' },
        headers: {},
        variables: {},
      };

      const folderVars = {
        host: 'api.folder.com',
        version: 'v2',
        tenant: 'folder-tenant',
      };

      const result = composeFinalRequest(
        request,
        undefined,
        undefined,
        folderVars
      );

      expect(result.url).toBe('https://api.folder.com/v2/users');
      expect(result.params).toEqual({ tenant: 'folder-tenant' });
    });

    it('should allow env vars to override folder vars', () => {
      const request = {
        url: 'https://{{host}}/api',
        params: {},
        headers: {},
        variables: {},
      };

      const folderVars = { host: 'folder.example.com' };
      const envVars = { host: 'env.example.com' };

      const result = composeFinalRequest(
        request,
        { variables: envVars },
        undefined,
        folderVars
      );

      expect(result.url).toBe('https://env.example.com/api');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed variable syntax gracefully', () => {
      expect(resolveTemplate('{{', {})).toBe('{{');
      expect(resolveTemplate('}}', {})).toBe('}}');
      expect(resolveTemplate('{var}', {})).toBe('{var}');
      expect(resolveTemplate('{{var', {})).toBe('{{var');
    });

    it('should handle special characters in variable values', () => {
      const result = resolveTemplate('{{token}}', {
        envVars: { token: 'abc!@#$%^&*()123' },
      });
      expect(result).toBe('abc!@#$%^&*()123');
    });

    it('should handle numeric variable names', () => {
      const result = resolveTemplate('{{var123}}', {
        envVars: { var123: 'value' },
      });
      expect(result).toBe('value');
    });

    it('should handle very long variable values', () => {
      const longValue = 'a'.repeat(10000);
      const result = resolveTemplate('{{var}}', {
        envVars: { var: longValue },
      });
      expect(result).toBe(longValue);
    });
  });
});

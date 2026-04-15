import { describe, expect, it } from 'vitest';
import {
  mapPostmanCollection,
  mapPostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
} from '../postman';

describe('postman.ts', () => {
  describe('isPostmanCollection', () => {
    it('returns true for a valid Postman v2.1 collection', () => {
      expect(
        isPostmanCollection({
          info: {
            name: 'My API',
            schema:
              'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
          },
          item: [],
        })
      ).toBe(true);
    });

    it('returns false when info or schema is missing', () => {
      expect(isPostmanCollection(null)).toBeFalsy();
      expect(isPostmanCollection(undefined)).toBeFalsy();
      expect(isPostmanCollection({})).toBeFalsy();
      expect(isPostmanCollection({ info: {} })).toBeFalsy();
      expect(isPostmanCollection({ info: { schema: 123 } })).toBeFalsy();
    });
  });

  describe('isPostmanEnvironment', () => {
    it('returns true for a valid Postman environment', () => {
      expect(
        isPostmanEnvironment({
          name: 'Dev',
          values: [{ key: 'host', value: 'localhost' }],
          _postman_variable_scope: 'environment',
        })
      ).toBe(true);
    });

    it('returns true when values array has keys even without scope', () => {
      expect(
        isPostmanEnvironment({
          name: 'Dev',
          values: [{ key: 'host', value: 'localhost' }],
        })
      ).toBe(true);
    });

    it('returns false for invalid data', () => {
      expect(isPostmanEnvironment(null)).toBeFalsy();
      expect(isPostmanEnvironment({})).toBeFalsy();
      expect(isPostmanEnvironment({ name: 'Dev' })).toBeFalsy();
      expect(isPostmanEnvironment({ values: [] })).toBeFalsy();
    });
  });

  describe('mapPostmanCollection', () => {
    const minimalCollection = {
      info: {
        name: 'Test API',
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [],
    };

    it('creates a root folder with type "folder" and the collection name', () => {
      const { rootFolder } = mapPostmanCollection(minimalCollection);
      expect(rootFolder.type).toBe('folder');
      expect(rootFolder.name).toBe('Test API');
      expect(rootFolder.children).toEqual([]);
    });

    it('returns empty environments when no collection-level variables exist', () => {
      const { environments } = mapPostmanCollection(minimalCollection);
      expect(environments).toEqual([]);
    });

    it('maps collection-level variables to a default environment', () => {
      const { environments } = mapPostmanCollection({
        ...minimalCollection,
        variable: [
          { key: 'host', value: 'api.example.com' },
          { key: 'port', value: '8080' },
        ],
      });

      expect(environments).toHaveLength(1);
      expect(environments[0].name).toBe('Test API Variables');
      expect(environments[0].variables).toEqual({
        host: 'api.example.com',
        port: '8080',
      });
    });

    it('maps a request item with method, URL, headers, and body', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Get Users',
            request: {
              method: 'GET',
              url: 'https://api.example.com/users',
              header: [
                { key: 'Accept', value: 'application/json' },
                { key: 'Disabled', value: 'ignored', disabled: true },
              ],
            },
          },
        ],
      });

      expect(rootFolder.children).toHaveLength(1);
      const child = rootFolder.children![0];
      expect(child.type).toBe('request');
      expect(child.name).toBe('Get Users');
      expect(child.request?.method).toBe('GET');
      expect(child.request?.url).toBe('https://api.example.com/users');
      expect(child.request?.headers).toEqual({ Accept: 'application/json' });
    });

    it('maps a folder item with nested children', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Users Folder',
            item: [
              {
                name: 'Create User',
                request: {
                  method: 'POST',
                  url: 'https://api.example.com/users',
                  body: {
                    mode: 'raw',
                    raw: '{"name":"John"}',
                  },
                },
              },
            ],
          },
        ],
      });

      const folder = rootFolder.children![0];
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('Users Folder');
      expect(folder.children).toHaveLength(1);

      const request = folder.children![0];
      expect(request.type).toBe('request');
      expect(request.request?.method).toBe('POST');
      expect(request.request?.body?.type).toBe('json');
      expect(request.request?.body?.content).toBe('{"name":"John"}');
    });

    it('maps PostmanUrl object with raw URL and query params', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Search',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.example.com/search?q=test',
                query: [
                  { key: 'q', value: 'test' },
                  { key: 'disabled', value: 'skip', disabled: true },
                ],
              },
            },
          },
        ],
      });

      const req = rootFolder.children![0].request!;
      expect(req.url).toBe('https://api.example.com/search?q=test');
      expect(req.params).toEqual({ q: 'test' });
    });

    it('maps urlencoded body correctly', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Login',
            request: {
              method: 'POST',
              url: 'https://api.example.com/login',
              body: {
                mode: 'urlencoded',
                urlencoded: [
                  { key: 'username', value: 'admin' },
                  { key: 'password', value: 'secret' },
                  { key: 'disabled', value: 'skip', disabled: true },
                ],
              },
            },
          },
        ],
      });

      const body = rootFolder.children![0].request?.body;
      expect(body?.type).toBe('form-urlencoded');
      expect(body?.content).toBe('username=admin&password=secret');
    });

    it('maps formdata body correctly', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Upload',
            request: {
              method: 'POST',
              url: 'https://api.example.com/upload',
              body: {
                mode: 'formdata',
                formdata: [
                  { key: 'file', value: 'test.txt', type: 'file' },
                  { key: 'name', value: 'doc' },
                ],
              },
            },
          },
        ],
      });

      const body = rootFolder.children![0].request?.body;
      expect(body?.type).toBe('form-data');
      expect(body?.content).toBe('file=test.txt\nname=doc');
    });

    it('maps raw non-JSON body as type "raw"', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [
          {
            name: 'Send XML',
            request: {
              method: 'POST',
              url: 'https://api.example.com/xml',
              body: {
                mode: 'raw',
                raw: '<root>hello</root>',
              },
            },
          },
        ],
      });

      const body = rootFolder.children![0].request?.body;
      expect(body?.type).toBe('raw');
      expect(body?.content).toBe('<root>hello</root>');
    });

    it('handles empty item (no request, no sub-items) as empty folder', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        item: [{ name: 'Empty' }],
      });

      const child = rootFolder.children![0];
      expect(child.type).toBe('folder');
      expect(child.children).toEqual([]);
    });

    it('uses collection-level auth when request has no auth', () => {
      const { rootFolder } = mapPostmanCollection({
        ...minimalCollection,
        auth: {
          type: 'bearer',
          bearer: [{ key: 'token', value: 'abc123' }],
        },
        item: [
          {
            name: 'Authed',
            request: {
              method: 'GET',
              url: 'https://api.example.com/me',
            },
          },
        ],
      });

      expect(rootFolder.children![0].request?.auth).toEqual({
        type: 'bearer',
        config: { token: 'abc123' },
      });
    });
  });

  describe('mapPostmanEnvironment', () => {
    it('maps enabled variables and ignores disabled ones', () => {
      const env = mapPostmanEnvironment({
        name: 'Production',
        values: [
          { key: 'host', value: 'api.prod.com', enabled: true },
          { key: 'secret', value: 'hidden', enabled: false },
          { key: 'port', value: '443' },
        ],
      });

      expect(env.name).toBe('Production');
      expect(env.variables).toEqual({
        host: 'api.prod.com',
        port: '443',
      });
      expect(env.id).toBeTruthy();
    });

    it('handles an environment with no values', () => {
      const env = mapPostmanEnvironment({
        name: 'Empty',
        values: [],
      });

      expect(env.name).toBe('Empty');
      expect(env.variables).toEqual({});
    });
  });
});

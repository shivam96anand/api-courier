import { describe, expect, it } from 'vitest';
import { isOpenApiDocument, mapOpenApiDocument } from '../openapi';

describe('openapi importer', () => {
  describe('isOpenApiDocument', () => {
    it('detects OpenAPI 3.0', () => {
      expect(isOpenApiDocument({ openapi: '3.0.1', paths: { '/x': {} } })).toBe(
        true
      );
    });
    it('detects OpenAPI 3.1', () => {
      expect(isOpenApiDocument({ openapi: '3.1.0', paths: { '/x': {} } })).toBe(
        true
      );
    });
    it('detects Swagger 2.0', () => {
      expect(isOpenApiDocument({ swagger: '2.0', paths: { '/x': {} } })).toBe(
        true
      );
    });
    it('rejects when paths is missing', () => {
      expect(isOpenApiDocument({ openapi: '3.0.0' })).toBe(false);
    });
    it('rejects unrelated objects', () => {
      expect(isOpenApiDocument({})).toBe(false);
      expect(isOpenApiDocument(null)).toBe(false);
    });
  });

  describe('mapOpenApiDocument — OpenAPI 3', () => {
    it('maps GET path with params, baseUrl env, and bearer auth', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'Users API' },
        servers: [{ url: 'https://api.example.com/v1' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
        security: [{ bearerAuth: [] }],
        paths: {
          '/users/{id}': {
            get: {
              tags: ['Users'],
              summary: 'Get user',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  schema: { type: 'string', example: '42' },
                },
                {
                  name: 'verbose',
                  in: 'query',
                  schema: { type: 'boolean', default: true },
                },
              ],
            },
          },
        },
      };
      const { rootFolder, environments } = mapOpenApiDocument(doc);
      expect(rootFolder.name).toBe('Users API');
      expect(rootFolder.children).toHaveLength(1);
      const folder = rootFolder.children![0];
      expect(folder.name).toBe('Users');
      const req = folder.children![0].request!;
      expect(req.method).toBe('GET');
      expect(req.url).toBe('{{baseUrl}}/users/{{id}}');
      expect(req.params).toEqual({ verbose: 'true' });
      expect(req.variables).toEqual({ id: '42' });
      expect(req.auth).toEqual({ type: 'bearer', config: { token: '' } });
      expect(environments).toHaveLength(1);
      expect(environments[0].variables.baseUrl).toBe(
        'https://api.example.com/v1'
      );
    });

    it('maps POST with JSON requestBody using example', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'X' },
        servers: [{ url: 'https://x' }],
        paths: {
          '/things': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    example: { name: 'alice' },
                  },
                },
              },
            },
          },
        },
      };
      const { rootFolder } = mapOpenApiDocument(doc);
      const req = rootFolder.children![0].children![0].request!;
      expect(req.method).toBe('POST');
      expect(req.body).toEqual({
        type: 'json',
        content: '{\n  "name": "alice"\n}',
      });
      expect((req.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json'
      );
    });

    it('groups operations under "Untagged" when no tag', () => {
      const doc = {
        openapi: '3.0.0',
        info: { title: 'X' },
        paths: { '/a': { get: {} } },
      };
      const { rootFolder } = mapOpenApiDocument(doc);
      expect(rootFolder.children).toHaveLength(1);
      expect(rootFolder.children![0].name).toBe('Untagged');
    });
  });

  describe('mapOpenApiDocument — Swagger 2.0', () => {
    it('builds baseUrl from host + basePath + scheme', () => {
      const doc = {
        swagger: '2.0',
        info: { title: 'Legacy' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['https'],
        paths: { '/ping': { get: {} } },
      };
      const { environments } = mapOpenApiDocument(doc);
      expect(environments[0].variables.baseUrl).toBe(
        'https://api.example.com/v2'
      );
    });

    it('maps body parameter as JSON', () => {
      const doc = {
        swagger: '2.0',
        info: { title: 'X' },
        paths: {
          '/things': {
            post: {
              parameters: [
                {
                  name: 'body',
                  in: 'body',
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string', example: 'a' } },
                  },
                },
              ],
              consumes: ['application/json'],
            },
          },
        },
      };
      const { rootFolder } = mapOpenApiDocument(doc);
      const req = rootFolder.children![0].children![0].request!;
      expect(req.body).toEqual({
        type: 'json',
        content: '{\n  "name": "a"\n}',
      });
    });
  });
});

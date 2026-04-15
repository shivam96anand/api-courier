import { describe, expect, it } from 'vitest';
import { detectAndParse, generatePreview, parseJsonFile } from '../index';

describe('importers/index.ts', () => {
  describe('detectAndParse', () => {
    it('detects Postman v2.1 collection', () => {
      const result = detectAndParse({
        info: {
          name: 'My API',
          schema:
            'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Get Users',
            request: {
              method: 'GET',
              url: 'https://api.example.com/users',
            },
          },
        ],
      });

      expect(result.kind).toBe('postman-collection');
      expect(result.name).toBe('My API');
      expect(result.rootFolder).toBeDefined();
      expect(result.rootFolder!.children).toHaveLength(1);
    });

    it('detects Postman environment', () => {
      const result = detectAndParse({
        name: 'Dev Env',
        values: [
          { key: 'host', value: 'localhost', enabled: true },
          { key: 'port', value: '3000', enabled: true },
        ],
        _postman_variable_scope: 'environment',
      });

      expect(result.kind).toBe('postman-environment');
      expect(result.name).toBe('Dev Env');
      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].variables).toEqual({
        host: 'localhost',
        port: '3000',
      });
    });

    it('detects Insomnia V4 export', () => {
      const result = detectAndParse({
        __export_format: 4,
        resources: [
          { _id: 'wrk_1', _type: 'workspace', name: 'My Workspace' },
          {
            _id: 'req_1',
            _type: 'request',
            name: 'Test',
            url: 'https://api.test.com',
            method: 'GET',
            parentId: 'wrk_1',
          },
        ],
      });

      expect(result.kind).toBe('insomnia');
      expect(result.name).toBe('My Workspace');
      expect(result.rootFolder).toBeDefined();
    });

    it('detects Insomnia V5 export', () => {
      const result = detectAndParse({
        type: 'insomnia.exportv5',
        collection: [
          {
            name: 'Folder',
            children: [
              {
                name: 'Req',
                method: 'GET',
                url: 'https://test.com',
              },
            ],
          },
        ],
      });

      expect(result.kind).toBe('insomnia');
      expect(result.rootFolder).toBeDefined();
    });

    it('detects Restbro native export', () => {
      const result = detectAndParse({
        type: 'restbro-export',
        collection: {
          id: 'col-1',
          name: 'My Collection',
          type: 'folder',
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        environments: [],
      });

      expect(result.kind).toBe('restbro-export');
      expect(result.rootFolder).toBeDefined();
    });

    it('returns unknown for unrecognized format', () => {
      const result = detectAndParse({ random: 'data', foo: 'bar' });

      expect(result.kind).toBe('unknown');
      expect(result.name).toBe('Unknown Format');
      expect(result.environments).toEqual([]);
    });

    it('returns empty environments for unknown format', () => {
      const result = detectAndParse({});
      expect(result.environments).toEqual([]);
    });
  });

  describe('generatePreview', () => {
    it('counts folders and requests correctly', () => {
      const importResult = detectAndParse({
        info: {
          name: 'Preview Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Folder A',
            item: [
              {
                name: 'Request 1',
                request: { method: 'GET', url: 'https://a.com/1' },
              },
              {
                name: 'Request 2',
                request: { method: 'POST', url: 'https://a.com/2' },
              },
            ],
          },
          {
            name: 'Request 3',
            request: { method: 'GET', url: 'https://a.com/3' },
          },
        ],
      });

      const preview = generatePreview(importResult);
      expect(preview.name).toBe('Preview Test');
      expect(preview.summary.folders).toBe(1);
      expect(preview.summary.requests).toBe(3);
      expect(preview.summary.environments).toBe(0);
    });

    it('counts environments', () => {
      const importResult = detectAndParse({
        info: {
          name: 'Env Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
        variable: [
          { key: 'host', value: 'localhost' },
          { key: 'port', value: '3000' },
        ],
      });

      const preview = generatePreview(importResult);
      expect(preview.summary.environments).toBe(1);
    });

    it('handles import result with no root folder', () => {
      const preview = generatePreview({
        kind: 'unknown',
        name: 'Unknown',
        environments: [],
      });

      expect(preview.summary.folders).toBe(0);
      expect(preview.summary.requests).toBe(0);
    });

    it('includes kind and globals in preview', () => {
      const importResult = detectAndParse({
        type: 'restbro-export',
        collection: {
          id: 'col-1',
          name: 'Test',
          type: 'folder',
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        environments: [],
        globals: { variables: { apiKey: 'test' } },
      });

      const preview = generatePreview(importResult);
      expect(preview.kind).toBe('restbro-export');
      expect(preview.globals).toBeDefined();
    });
  });

  describe('parseJsonFile', () => {
    it('parses valid JSON', () => {
      const result = parseJsonFile('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('parses valid YAML when JSON fails', () => {
      const result = parseJsonFile('key: value\nlist:\n  - one\n  - two');
      expect(result).toEqual({ key: 'value', list: ['one', 'two'] });
    });

    it('throws for invalid JSON and YAML', () => {
      expect(() => parseJsonFile('}{not valid at all}{')).toThrow('Invalid file format');
    });
  });
});

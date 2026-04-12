import { describe, expect, it } from 'vitest';
import {
  isApiCourierExport,
  mapApiCourierExport,
} from '../api-courier';
import { detectAndParse, generatePreview } from '../index';

describe('importers/api-courier', () => {
  describe('isApiCourierExport', () => {
    it('returns true for object with type api-courier-export and collection', () => {
      expect(isApiCourierExport({ type: 'api-courier-export', collection: {} })).toBe(true);
    });

    it('returns true for object with type api-courier-export and collections array', () => {
      expect(isApiCourierExport({ type: 'api-courier-export', collections: [] })).toBe(true);
    });

    it('returns false for null or non-object', () => {
      expect(isApiCourierExport(null)).toBe(false);
      expect(isApiCourierExport(undefined)).toBe(false);
      expect(isApiCourierExport('string')).toBe(false);
    });

    it('returns false when type is not api-courier-export', () => {
      expect(isApiCourierExport({ type: 'postman', collection: {} })).toBe(false);
    });

    it('returns false when neither collection nor collections present', () => {
      expect(isApiCourierExport({ type: 'api-courier-export' })).toBe(false);
    });
  });

  describe('mapApiCourierExport', () => {
    it('produces rootFolder with children and environments', () => {
      const exportData = {
        type: 'api-courier-export' as const,
        collections: [
          {
            id: 'f1',
            name: 'Folder',
            type: 'folder' as const,
            children: [
              {
                id: 'r1',
                name: 'Req',
                type: 'request' as const,
                request: { id: 'req-1', name: 'Req', method: 'GET' as const, url: 'https://x.com', headers: {} },
                children: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        environments: [
          { id: 'e1', name: 'Dev', variables: { baseUrl: 'http://localhost' } },
        ],
      };

      const result = mapApiCourierExport(exportData);

      expect(result.rootFolder.type).toBe('folder');
      expect(result.rootFolder.name).toBe('Restbro Export');
      expect(result.rootFolder.children).toHaveLength(1);
      expect(result.rootFolder.children![0].name).toBe('Folder');
      expect(result.rootFolder.children![0].id).not.toBe('f1');
      expect(result.rootFolder.children![0].children).toHaveLength(1);
      expect(result.rootFolder.children![0].children![0].request?.id).not.toBe('req-1');

      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].name).toBe('Dev');
      expect(result.environments[0].variables.baseUrl).toBe('http://localhost');
      expect(result.environments[0].id).not.toBe('e1');
    });

    it('supports legacy single collection shape', () => {
      const exportData = {
        type: 'api-courier-export' as const,
        collection: {
          id: 'c1',
          name: 'My Collection',
          type: 'folder' as const,
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        environments: [],
      };

      const result = mapApiCourierExport(exportData);

      expect(result.rootFolder.children).toHaveLength(1);
      expect(result.rootFolder.children![0].name).toBe('My Collection');
    });

    it('passes through globals when present', () => {
      const exportData = {
        type: 'api-courier-export' as const,
        collections: [],
        environments: [],
        globals: { variables: { token: 'secret' }, variableDescriptions: { token: 'API key' } },
      };

      const result = mapApiCourierExport(exportData);

      expect(result.globals).toEqual(exportData.globals);
    });
  });

  describe('detectAndParse + generatePreview (api-courier-export)', () => {
    it('detects and parses api-courier-export and produces preview with kind and globals', () => {
      const json = {
        type: 'api-courier-export',
        version: '1.0',
        collections: [
          {
            id: 'f1',
            name: 'API',
            type: 'folder',
            children: [
              {
                id: 'r1',
                name: 'Get',
                type: 'request',
                request: { id: 'req1', name: 'Get', method: 'GET', url: 'https://api.example.com', headers: {} },
                children: [],
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        environments: [
          { id: 'e1', name: 'Production', variables: { host: 'https://prod.example.com' } },
        ],
        globals: { variables: { apiKey: 'xxx' } },
      };

      const importResult = detectAndParse(json);

      expect(importResult.kind).toBe('api-courier-export');
      expect(importResult.name).toBe('Restbro Export');
      expect(importResult.rootFolder?.children).toHaveLength(1);
      expect(importResult.environments).toHaveLength(1);
      expect(importResult.globals?.variables?.apiKey).toBe('xxx');

      const preview = generatePreview(importResult);

      expect(preview.kind).toBe('api-courier-export');
      expect(preview.summary.folders).toBe(1);
      expect(preview.summary.requests).toBe(1);
      expect(preview.summary.environments).toBe(1);
      expect(preview.globals?.variables?.apiKey).toBe('xxx');
    });

    it('api-courier-export is preferred over Postman when both could match', () => {
      const json = {
        type: 'api-courier-export',
        collection: {
          id: 'c1',
          name: 'Collection',
          type: 'folder',
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        environments: [],
      };

      const result = detectAndParse(json);
      expect(result.kind).toBe('api-courier-export');
    });
  });
});

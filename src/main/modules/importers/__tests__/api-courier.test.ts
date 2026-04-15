import { describe, expect, it } from 'vitest';
import { isRestbroExport, mapRestbroExport, RestbroExportData } from '../api-courier';

function createExportData(overrides: Partial<RestbroExportData> = {}): RestbroExportData {
  return {
    type: 'restbro-export',
    collection: {
      id: 'col-1',
      name: 'Test Collection',
      type: 'folder',
      children: [
        {
          id: 'req-1',
          name: 'Get Users',
          type: 'request',
          request: {
            id: 'r-1',
            name: 'Get Users',
            method: 'GET',
            url: 'https://api.example.com/users',
            headers: {},
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  } as RestbroExportData;
}

describe('api-courier.ts', () => {
  describe('isRestbroExport', () => {
    it('returns true for restbro-export type with collection', () => {
      expect(isRestbroExport({ type: 'restbro-export', collection: {} })).toBe(true);
    });

    it('returns true for api-courier-export type with collection', () => {
      expect(isRestbroExport({ type: 'api-courier-export', collection: {} })).toBe(true);
    });

    it('returns true for restbro-export with collections array', () => {
      expect(isRestbroExport({ type: 'restbro-export', collections: [] })).toBe(true);
    });

    it('returns false for unknown type', () => {
      expect(isRestbroExport({ type: 'postman', collection: {} })).toBe(false);
    });

    it('returns false for missing collection/collections', () => {
      expect(isRestbroExport({ type: 'restbro-export' })).toBe(false);
    });

    it('returns false for non-object values', () => {
      expect(isRestbroExport('string')).toBe(false);
      expect(isRestbroExport(42)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRestbroExport(null)).toBe(false);
    });
  });

  describe('mapRestbroExport', () => {
    it('creates a root folder wrapping collections', () => {
      const data = createExportData();
      const result = mapRestbroExport(data);

      expect(result.rootFolder).toBeDefined();
      expect(result.rootFolder.type).toBe('folder');
      expect(result.rootFolder.name).toBe('Restbro Export');
    });

    it('reassigns IDs to avoid conflicts', () => {
      const data = createExportData();
      const result = mapRestbroExport(data);

      // Root folder should have new ID
      expect(result.rootFolder.id).toBeDefined();
      // All children should have IDs
      expect(result.rootFolder.children!.length).toBeGreaterThan(0);
      const child = result.rootFolder.children![0];
      expect(child.id).toBeDefined();
      expect(child.id).not.toBe('col-1');
    });

    it('reassigns request IDs in nested requests', () => {
      const data = createExportData();
      const result = mapRestbroExport(data);

      // The root folder wraps the export collection, so we need to find the request
      const findRequest = (col: any): any => {
        if (col.request) return col;
        if (col.children) {
          for (const child of col.children) {
            const found = findRequest(child);
            if (found) return found;
          }
        }
        return null;
      };
      const requestCol = findRequest(result.rootFolder);
      expect(requestCol).not.toBeNull();
      expect(requestCol.request.id).not.toBe('r-1');
    });

    it('maps environments with new IDs', () => {
      const data = createExportData({
        environments: [
          { id: 'env-1', name: 'Dev', variables: { host: 'localhost' } },
        ],
      });

      const result = mapRestbroExport(data);
      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].name).toBe('Dev');
      expect(result.environments[0].variables).toEqual({ host: 'localhost' });
      expect(result.environments[0].id).not.toBe('env-1');
    });

    it('passes through globals', () => {
      const data = createExportData({
        globals: { variables: { apiKey: 'test-key' } },
      });

      const result = mapRestbroExport(data);
      expect(result.globals).toBeDefined();
      expect(result.globals!.variables).toEqual({ apiKey: 'test-key' });
    });

    it('handles collections array format', () => {
      const data: RestbroExportData = {
        type: 'restbro-export',
        collections: [
          {
            id: 'c1', name: 'Col 1', type: 'folder',
            createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: 'c2', name: 'Col 2', type: 'folder',
            createdAt: new Date(), updatedAt: new Date(),
          },
        ],
      };

      const result = mapRestbroExport(data);
      expect(result.rootFolder.children).toHaveLength(2);
    });
  });
});

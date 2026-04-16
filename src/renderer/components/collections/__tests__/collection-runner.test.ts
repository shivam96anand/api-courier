import { describe, it, expect } from 'vitest';
import { CollectionRunner } from '../collection-runner';
import { Collection } from '../../../shared/types';

function makeCollection(
  overrides: Partial<Collection>
): Collection {
  return {
    id: 'c1',
    name: 'Test',
    type: 'folder',
    order: 0,
    ...overrides,
  } as Collection;
}

describe('CollectionRunner.collectRequests', () => {
  it('returns empty array for folder with no children', () => {
    const collections = [makeCollection({ id: 'root', type: 'folder' })];
    const result = CollectionRunner.collectRequests('root', collections);
    expect(result).toEqual([]);
  });

  it('collects requests from direct children', () => {
    const collections: Collection[] = [
      makeCollection({ id: 'root', type: 'folder' }),
      makeCollection({
        id: 'req1',
        parentId: 'root',
        type: 'request',
        order: 0,
        request: {
          id: 'r1',
          name: 'Get Users',
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {},
        } as any,
      }),
      makeCollection({
        id: 'req2',
        parentId: 'root',
        type: 'request',
        order: 1,
        request: {
          id: 'r2',
          name: 'Get Posts',
          method: 'GET',
          url: 'https://api.example.com/posts',
          headers: {},
        } as any,
      }),
    ];

    const result = CollectionRunner.collectRequests('root', collections);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Get Users');
    expect(result[1].name).toBe('Get Posts');
  });

  it('collects requests recursively from nested folders', () => {
    const collections: Collection[] = [
      makeCollection({ id: 'root', type: 'folder' }),
      makeCollection({
        id: 'subfolder',
        parentId: 'root',
        type: 'folder',
        order: 0,
      }),
      makeCollection({
        id: 'req1',
        parentId: 'subfolder',
        type: 'request',
        order: 0,
        request: {
          id: 'r1',
          name: 'Nested Request',
          method: 'POST',
          url: 'https://api.example.com/data',
          headers: {},
        } as any,
      }),
    ];

    const result = CollectionRunner.collectRequests('root', collections);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Nested Request');
  });

  it('respects order of requests', () => {
    const collections: Collection[] = [
      makeCollection({ id: 'root', type: 'folder' }),
      makeCollection({
        id: 'req3',
        parentId: 'root',
        type: 'request',
        order: 2,
        request: {
          id: 'r3',
          name: 'Third',
          method: 'GET',
          url: 'https://api.example.com/3',
          headers: {},
        } as any,
      }),
      makeCollection({
        id: 'req1',
        parentId: 'root',
        type: 'request',
        order: 0,
        request: {
          id: 'r1',
          name: 'First',
          method: 'GET',
          url: 'https://api.example.com/1',
          headers: {},
        } as any,
      }),
      makeCollection({
        id: 'req2',
        parentId: 'root',
        type: 'request',
        order: 1,
        request: {
          id: 'r2',
          name: 'Second',
          method: 'GET',
          url: 'https://api.example.com/2',
          headers: {},
        } as any,
      }),
    ];

    const result = CollectionRunner.collectRequests('root', collections);
    expect(result.map((r) => r.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips folders without requests', () => {
    const collections: Collection[] = [
      makeCollection({ id: 'root', type: 'folder' }),
      makeCollection({
        id: 'empty-folder',
        parentId: 'root',
        type: 'folder',
        order: 0,
      }),
      makeCollection({
        id: 'req1',
        parentId: 'root',
        type: 'request',
        order: 1,
        request: {
          id: 'r1',
          name: 'Only Request',
          method: 'GET',
          url: 'https://api.example.com/',
          headers: {},
        } as any,
      }),
    ];

    const result = CollectionRunner.collectRequests('root', collections);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Only Request');
  });

  it('returns empty for nonexistent folder id', () => {
    const collections: Collection[] = [
      makeCollection({ id: 'root', type: 'folder' }),
    ];
    const result = CollectionRunner.collectRequests('nonexistent', collections);
    expect(result).toEqual([]);
  });
});

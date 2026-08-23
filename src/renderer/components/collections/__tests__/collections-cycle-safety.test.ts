/**
 * @vitest-environment jsdom
 *
 * Regression: a collection tree whose `parentId` forms a cycle (possible via a
 * hand-edited export or a corrupt database.json) used to hang the sidebar
 * search forever and overflow the stack in `getDescendants`.
 */
import { describe, it, expect, vi } from 'vitest';
import { CollectionsSearch } from '../collections-search';
import { CollectionsOperations } from '../collections-operations';
import { Collection } from '../../../../shared/types';

function cyclicTree(): Collection[] {
  return [
    { id: 'a', name: 'Alpha', type: 'folder', parentId: 'b' },
    { id: 'b', name: 'Beta', type: 'folder', parentId: 'a' },
    { id: 'c', name: 'Gamma', type: 'folder', parentId: 'c' },
  ] as unknown as Collection[];
}

function makeSearch(): CollectionsSearch {
  return new CollectionsSearch(vi.fn(), vi.fn());
}

function descendantsOf(ops: CollectionsOperations, id: string): string[] {
  return (
    ops as unknown as { getDescendants(folderId: string): string[] }
  ).getDescendants(id);
}

describe('CollectionsSearch with a cyclic tree', () => {
  it('terminates and returns the match plus its ancestors', () => {
    const result = makeSearch().getFilteredCollections(cyclicTree(), 'alpha');
    expect(result.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('terminates on a self-parented folder', () => {
    const result = makeSearch().getFilteredCollections(cyclicTree(), 'gamma');
    expect(result.map((c) => c.id)).toEqual(['c']);
  });

  it('still collects ancestors for a normal tree', () => {
    const tree = [
      { id: 'root', name: 'Root', type: 'folder' },
      { id: 'mid', name: 'Mid', type: 'folder', parentId: 'root' },
      { id: 'leaf', name: 'Target', type: 'request', parentId: 'mid' },
    ] as unknown as Collection[];
    const result = makeSearch().getFilteredCollections(tree, 'target');
    expect(result.map((c) => c.id).sort()).toEqual(['leaf', 'mid', 'root']);
  });
});

describe('CollectionsOperations with a cyclic tree', () => {
  it('does not overflow the stack when collecting descendants', () => {
    const ops = new CollectionsOperations(vi.fn());
    ops.setCollections(cyclicTree());
    expect(descendantsOf(ops, 'a')).toEqual(['b']);
  });

  it('still walks a normal descendant tree', () => {
    const ops = new CollectionsOperations(vi.fn());
    ops.setCollections([
      { id: 'root', name: 'Root', type: 'folder' },
      { id: 'mid', name: 'Mid', type: 'folder', parentId: 'root' },
      { id: 'leaf', name: 'Leaf', type: 'request', parentId: 'mid' },
    ] as unknown as Collection[]);
    expect(descendantsOf(ops, 'root').sort()).toEqual(['leaf', 'mid']);
  });

  it('still refuses to move a folder into its own descendant', async () => {
    const onShowError = vi.fn();
    const ops = new CollectionsOperations(onShowError);
    ops.setCollections([
      { id: 'root', name: 'Root', type: 'folder' },
      { id: 'child', name: 'Child', type: 'folder', parentId: 'root' },
    ] as unknown as Collection[]);

    await ops.moveCollection('root', 'child');
    expect(onShowError).toHaveBeenCalledWith(
      'Cannot move folder into itself or its descendants'
    );
  });
});

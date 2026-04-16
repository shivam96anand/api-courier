/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CollectionsOperations } from '../collections-operations';
import { Collection, ApiRequest } from '../../../../shared/types';

// Mock collections-dialogs
vi.mock('../collections-dialogs', () => ({
  CollectionsDialogs: vi.fn().mockImplementation(() => ({
    showCreateDialog: vi.fn(),
    showRenameDialog: vi.fn(),
    showConfirm: vi.fn(),
  })),
}));

// Mock export-dialog
vi.mock('../export-dialog', () => ({
  showExportDialog: vi.fn(),
}));

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    type: 'folder',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com',
    headers: {},
    ...overrides,
  };
}

describe('CollectionsOperations', () => {
  let ops: CollectionsOperations;
  let showErrorCalls: string[];
  let mockCollectionUpdate: ReturnType<typeof vi.fn>;
  let mockCollectionCreate: ReturnType<typeof vi.fn>;
  let mockCollectionDelete: ReturnType<typeof vi.fn>;
  let mockStoreGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showErrorCalls = [];
    mockCollectionUpdate = vi.fn().mockResolvedValue(undefined);
    mockCollectionCreate = vi.fn().mockImplementation(async (data: any) => ({
      ...data,
      id: `new-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockCollectionDelete = vi.fn().mockResolvedValue(undefined);
    mockStoreGet = vi.fn().mockResolvedValue({
      collections: [],
      environments: [],
      globals: { variables: {} },
    });

    // Set up window.restbro mock
    (window as any).restbro = {
      collection: {
        update: mockCollectionUpdate,
        create: mockCollectionCreate,
        delete: mockCollectionDelete,
      },
      store: { get: mockStoreGet },
    };

    vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);

    ops = new CollectionsOperations((msg) => showErrorCalls.push(msg));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).restbro;
  });

  describe('findCollectionById', () => {
    it('returns the collection when found', () => {
      const col = makeCollection({ id: 'abc' });
      ops.setCollections([col]);
      expect(ops.findCollectionById('abc')).toBe(col);
    });

    it('returns undefined when not found', () => {
      ops.setCollections([makeCollection({ id: 'abc' })]);
      expect(ops.findCollectionById('xyz')).toBeUndefined();
    });

    it('returns undefined for empty collections', () => {
      ops.setCollections([]);
      expect(ops.findCollectionById('abc')).toBeUndefined();
    });
  });

  describe('moveCollection', () => {
    it('moves a collection into a target folder', async () => {
      const folder = makeCollection({ id: 'folder-1', type: 'folder' });
      const child = makeCollection({
        id: 'child-1',
        type: 'request',
        parentId: undefined,
      });
      ops.setCollections([folder, child]);

      await ops.moveCollection('child-1', 'folder-1');

      expect(mockCollectionUpdate).toHaveBeenCalledWith('child-1', {
        parentId: 'folder-1',
      });
      expect(child.parentId).toBe('folder-1');
    });

    it('does nothing when dragged item not found', async () => {
      ops.setCollections([makeCollection({ id: 'folder-1', type: 'folder' })]);
      await ops.moveCollection('nonexistent', 'folder-1');
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when target is not a folder', async () => {
      const target = makeCollection({ id: 'target-1', type: 'request' });
      const dragged = makeCollection({ id: 'dragged-1', type: 'request' });
      ops.setCollections([target, dragged]);

      await ops.moveCollection('dragged-1', 'target-1');
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });

    it('prevents moving folder into its own descendant', async () => {
      const parent = makeCollection({ id: 'parent', type: 'folder' });
      const child = makeCollection({
        id: 'child',
        type: 'folder',
        parentId: 'parent',
      });
      ops.setCollections([parent, child]);

      await ops.moveCollection('parent', 'child');
      expect(showErrorCalls).toContain(
        'Cannot move folder into itself or its descendants'
      );
      // Should not have called update
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });

    it('shows error when update fails', async () => {
      mockCollectionUpdate.mockRejectedValueOnce(new Error('fail'));
      const folder = makeCollection({ id: 'folder-1', type: 'folder' });
      const child = makeCollection({ id: 'child-1', type: 'request' });
      ops.setCollections([folder, child]);

      await ops.moveCollection('child-1', 'folder-1');
      expect(showErrorCalls).toContain('Failed to move collection');
    });
  });

  describe('reorderCollection', () => {
    it('reorders a collection before a target', async () => {
      const col1 = makeCollection({
        id: 'col-1',
        order: 0,
        parentId: undefined,
      });
      const col2 = makeCollection({
        id: 'col-2',
        order: 1000,
        parentId: undefined,
      });
      const col3 = makeCollection({
        id: 'col-3',
        order: 2000,
        parentId: undefined,
      });
      ops.setCollections([col1, col2, col3]);

      await ops.reorderCollection('col-3', 'col-1', 'before');

      expect(mockCollectionUpdate).toHaveBeenCalled();
      expect(document.dispatchEvent).toHaveBeenCalled();
    });

    it('does nothing when dragging to same position', async () => {
      const col = makeCollection({ id: 'col-1', order: 0 });
      ops.setCollections([col]);

      await ops.reorderCollection('col-1', 'col-1', 'before');
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when dragged item not found', async () => {
      ops.setCollections([makeCollection({ id: 'col-1' })]);
      await ops.reorderCollection('nonexistent', 'col-1', 'before');
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });

    it('prevents reordering folder into its descendant', async () => {
      const parent = makeCollection({ id: 'parent', type: 'folder' });
      const child = makeCollection({
        id: 'child',
        type: 'folder',
        parentId: 'parent',
      });
      ops.setCollections([parent, child]);

      await ops.reorderCollection('parent', 'child', 'after');
      expect(showErrorCalls).toContain(
        'Cannot move folder into itself or its descendants'
      );
    });

    it('moves to different parent when needed', async () => {
      const folderA = makeCollection({
        id: 'folder-a',
        type: 'folder',
        parentId: undefined,
      });
      const folderB = makeCollection({
        id: 'folder-b',
        type: 'folder',
        parentId: undefined,
      });
      const req = makeCollection({
        id: 'req-1',
        type: 'request',
        parentId: 'folder-a',
        order: 0,
      });
      const target = makeCollection({
        id: 'target-1',
        type: 'request',
        parentId: 'folder-b',
        order: 0,
      });
      ops.setCollections([folderA, folderB, req, target]);

      await ops.reorderCollection('req-1', 'target-1', 'before');

      // Should update parentId
      expect(mockCollectionUpdate).toHaveBeenCalledWith('req-1', {
        parentId: 'folder-b',
      });
    });

    it('shows error when reorder fails', async () => {
      mockCollectionUpdate.mockRejectedValueOnce(new Error('fail'));
      const col1 = makeCollection({
        id: 'col-1',
        order: 0,
        parentId: undefined,
      });
      const col2 = makeCollection({
        id: 'col-2',
        order: 1000,
        parentId: undefined,
      });
      ops.setCollections([col1, col2]);

      await ops.reorderCollection('col-2', 'col-1', 'before');
      expect(showErrorCalls).toContain('Failed to reorder collection');
    });
  });

  describe('duplicateCollection', () => {
    it('duplicates a request collection', async () => {
      const col = makeCollection({
        id: 'col-1',
        name: 'My Request',
        type: 'request',
        order: 0,
        request: makeRequest(),
      });
      ops.setCollections([col]);

      await ops.duplicateCollection('col-1');

      expect(mockCollectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Request Copy',
          type: 'request',
        })
      );
      expect(document.dispatchEvent).toHaveBeenCalled();
    });

    it('does nothing for nonexistent collection', async () => {
      ops.setCollections([]);
      await ops.duplicateCollection('nonexistent');
      expect(mockCollectionCreate).not.toHaveBeenCalled();
    });

    it('duplicates children for folder type', async () => {
      const parent = makeCollection({
        id: 'parent',
        type: 'folder',
        order: 0,
      });
      const child = makeCollection({
        id: 'child',
        type: 'request',
        parentId: 'parent',
        order: 0,
        request: makeRequest({ id: 'child-req' }),
      });
      ops.setCollections([parent, child]);

      await ops.duplicateCollection('parent');

      // Should create the parent duplicate and recursively create child
      expect(mockCollectionCreate).toHaveBeenCalledTimes(2);
    });

    it('calculates correct order between siblings', async () => {
      const col1 = makeCollection({ id: 'col-1', order: 0 });
      const col2 = makeCollection({ id: 'col-2', order: 1000 });
      ops.setCollections([col1, col2]);

      await ops.duplicateCollection('col-1');

      // New order should be between 0 and 1000 = 500
      expect(mockCollectionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          order: 500,
        })
      );
    });

    it('shows error when duplication fails', async () => {
      mockCollectionCreate.mockRejectedValueOnce(new Error('fail'));
      ops.setCollections([makeCollection({ id: 'col-1', order: 0 })]);

      await ops.duplicateCollection('col-1');
      expect(showErrorCalls).toContain('Failed to duplicate collection');
    });
  });

  describe('exportCollection', () => {
    it('exports a single collection as JSON', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      } as any;
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      vi.spyOn(document.body, 'appendChild').mockReturnValue(mockLink);
      vi.spyOn(document.body, 'removeChild').mockReturnValue(mockLink);
      // jsdom doesn't define URL.createObjectURL/revokeObjectURL
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
      globalThis.URL.revokeObjectURL = vi.fn();

      const col = makeCollection({
        id: 'col-1',
        name: 'My Collection',
        type: 'folder',
      });
      ops.setCollections([col]);

      ops.exportCollection('col-1');

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toMatch(/my_collection_export\.json/);
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
    });

    it('does nothing for nonexistent collection', () => {
      const createSpy = vi.spyOn(document, 'createElement');
      ops.setCollections([]);
      ops.exportCollection('nonexistent');
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteCollection', () => {
    it('does nothing for nonexistent collection', async () => {
      ops.setCollections([]);
      await ops.deleteCollection('nonexistent');
      expect(mockCollectionDelete).not.toHaveBeenCalled();
    });
  });

  describe('renameCollection', () => {
    it('does nothing for nonexistent collection', async () => {
      ops.setCollections([]);
      await ops.renameCollection('nonexistent');
      expect(mockCollectionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('showCreateDialog', () => {
    it('adds created collection to internal list', async () => {
      const newCol = makeCollection({ id: 'new-1', name: 'New Folder' });
      // Access the mocked dialogs
      (ops as any).dialogs.showCreateDialog = vi.fn().mockResolvedValue(newCol);
      ops.setCollections([]);

      const result = await ops.showCreateDialog('folder');
      expect(result).toBe(newCol);
      expect(ops.findCollectionById('new-1')).toBe(newCol);
    });

    it('returns null when dialog is cancelled', async () => {
      (ops as any).dialogs.showCreateDialog = vi.fn().mockResolvedValue(null);
      ops.setCollections([]);

      const result = await ops.showCreateDialog('folder');
      expect(result).toBeNull();
    });
  });
});

import { Collection } from '../../../shared/types';
import { CollectionsDialogs } from './collections-dialogs';

export class CollectionsOperations {
  private collections: Collection[] = [];
  private onShowError: (message: string) => void;
  private dialogs: CollectionsDialogs;

  constructor(onShowError: (message: string) => void) {
    this.onShowError = onShowError;
    this.dialogs = new CollectionsDialogs(onShowError);
  }

  setCollections(collections: Collection[]): void {
    this.collections = collections;
  }

  findCollectionById(id: string): Collection | undefined {
    return this.collections.find(c => c.id === id);
  }

  async moveCollection(draggedId: string, targetFolderId: string): Promise<void> {
    const draggedCollection = this.findCollectionById(draggedId);
    const targetFolder = this.findCollectionById(targetFolderId);

    if (!draggedCollection || !targetFolder || targetFolder.type !== 'folder') {
      return;
    }

    if (this.isDescendant(targetFolderId, draggedId)) {
      this.onShowError('Cannot move folder into itself or its descendants');
      return;
    }

    try {
      await window.apiCourier.collection.update(draggedId, { parentId: targetFolderId });
      draggedCollection.parentId = targetFolderId;

      // Reorder items in the target folder
      await this.reorderItemsInParent(targetFolderId);
    } catch (error) {
      console.error('Failed to move collection:', error);
      this.onShowError('Failed to move collection');
    }
  }

  async reorderCollection(draggedId: string, targetId: string, position: 'before' | 'after'): Promise<void> {
    const draggedCollection = this.findCollectionById(draggedId);
    const targetCollection = this.findCollectionById(targetId);

    if (!draggedCollection || !targetCollection) {
      return;
    }

    // Prevent moving into itself
    if (draggedId === targetId) {
      return;
    }

    // Prevent moving folder into its descendants
    if (draggedCollection.type === 'folder' && this.isDescendant(targetId, draggedId)) {
      this.onShowError('Cannot move folder into itself or its descendants');
      return;
    }

    try {
      // Get siblings at the target level
      const siblings = this.collections
        .filter(c => c.parentId === targetCollection.parentId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      // Find target index
      const targetIndex = siblings.findIndex(c => c.id === targetId);
      if (targetIndex === -1) return;

      // Calculate new position
      const newIndex = position === 'before' ? targetIndex : targetIndex + 1;

      // If dragged item is being moved within same parent, adjust for removal
      const draggedIndex = siblings.findIndex(c => c.id === draggedId);
      const isDraggedInSameParent = draggedCollection.parentId === targetCollection.parentId;
      const adjustedNewIndex = isDraggedInSameParent && draggedIndex !== -1 && draggedIndex < newIndex
        ? newIndex - 1
        : newIndex;

      // Update parent if needed
      if (draggedCollection.parentId !== targetCollection.parentId) {
        await window.apiCourier.collection.update(draggedId, {
          parentId: targetCollection.parentId
        });
        draggedCollection.parentId = targetCollection.parentId;
      }

      // Remove dragged item from its current position in siblings array
      const filteredSiblings = siblings.filter(c => c.id !== draggedId);

      // Insert dragged item at new position
      filteredSiblings.splice(adjustedNewIndex, 0, draggedCollection);

      // Update order for all siblings
      for (let i = 0; i < filteredSiblings.length; i++) {
        const collection = filteredSiblings[i];
        const newOrder = i * 1000; // Use increments of 1000 for easier future insertions

        if (collection.order !== newOrder) {
          await window.apiCourier.collection.update(collection.id, { order: newOrder });
          collection.order = newOrder;
        }
      }

      // Dispatch collections changed event
      const event = new CustomEvent('collections-changed', {
        detail: { collections: this.collections }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to reorder collection:', error);
      this.onShowError('Failed to reorder collection');
    }
  }

  private async reorderItemsInParent(parentId?: string): Promise<void> {
    // Get all items at this level and reorder them
    const items = this.collections
      .filter(c => c.parentId === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (let i = 0; i < items.length; i++) {
      const newOrder = i * 1000;
      if (items[i].order !== newOrder) {
        await window.apiCourier.collection.update(items[i].id, { order: newOrder });
        items[i].order = newOrder;
      }
    }
  }

  private isDescendant(folderId: string, ancestorId: string): boolean {
    const descendants = this.getDescendants(ancestorId);
    return descendants.includes(folderId);
  }

  private getDescendants(folderId: string): string[] {
    const descendants: string[] = [];
    const children = this.collections.filter(c => c.parentId === folderId);

    for (const child of children) {
      descendants.push(child.id);
      if (child.type === 'folder') {
        descendants.push(...this.getDescendants(child.id));
      }
    }

    return descendants;
  }

  private getAllRequestsInFolder(folderId: string): string[] {
    const requestIds: string[] = [];
    const descendants = this.getDescendants(folderId);

    // Include the folder itself if it's a request
    const folder = this.findCollectionById(folderId);
    if (folder && folder.type === 'request' && folder.request) {
      requestIds.push(folder.request.id);
    }

    // Check all descendants for requests
    for (const descendantId of descendants) {
      const collection = this.findCollectionById(descendantId);
      if (collection && collection.type === 'request' && collection.request) {
        requestIds.push(collection.request.id);
      }
    }

    return requestIds;
  }

  async duplicateCollection(collectionId: string): Promise<void> {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    try {
      const duplicatedName = `${collection.name} Copy`;
      const newCollection = await window.apiCourier.collection.create({
        name: duplicatedName,
        type: collection.type,
        parentId: collection.parentId,
        request: collection.request ? { ...collection.request } : undefined
      });

      this.collections.push(newCollection);

      if (collection.type === 'folder') {
        await this.duplicateChildren(collection.id, newCollection.id);
      }
    } catch (error) {
      console.error('Failed to duplicate collection:', error);
      this.onShowError('Failed to duplicate collection');
    }
  }

  private async duplicateChildren(originalParentId: string, newParentId: string): Promise<void> {
    const children = this.collections.filter(c => c.parentId === originalParentId);

    for (const child of children) {
      try {
        const newChild = await window.apiCourier.collection.create({
          name: child.name,
          type: child.type,
          parentId: newParentId,
          request: child.request ? { ...child.request } : undefined
        });

        this.collections.push(newChild);

        if (child.type === 'folder') {
          await this.duplicateChildren(child.id, newChild.id);
        }
      } catch (error) {
        console.error('Failed to duplicate child collection:', error);
      }
    }
  }

  exportCollection(collectionId: string): void {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const exportData = {
      version: '1.0',
      type: 'api-courier-export',
      timestamp: new Date().toISOString(),
      collection: this.buildExportData(collection)
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${collection.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private buildExportData(collection: Collection): any {
    const data: any = {
      id: collection.id,
      name: collection.name,
      type: collection.type,
      request: collection.request,
      children: []
    };

    if (collection.type === 'folder') {
      const children = this.collections.filter(c => c.parentId === collection.id);
      data.children = children.map(child => this.buildExportData(child));
    }

    return data;
  }

  async showCreateDialog(type: 'folder' | 'request' = 'folder', parentId?: string): Promise<Collection | null> {
    const newCollection = await this.dialogs.showCreateDialog(type, parentId);
    if (newCollection) {
      this.collections.push(newCollection);
    }
    return newCollection;
  }

  async renameCollection(collectionId: string): Promise<void> {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const newName = await this.dialogs.showRenameDialog(collection);
    if (!newName) return;

    try {
      await window.apiCourier.collection.update(collectionId, { name: newName });
      collection.name = newName;
      collection.updatedAt = new Date();

      const event = new CustomEvent('collection-renamed', {
        detail: {
          collectionId,
          newName,
          collection
        }
      });
      document.dispatchEvent(event);

      const collectionsChangedEvent = new CustomEvent('collections-changed', {
        detail: { collections: this.collections }
      });
      document.dispatchEvent(collectionsChangedEvent);
    } catch (error) {
      console.error('Failed to rename collection:', error);
      this.onShowError('Failed to rename collection');
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const confirmed = await this.dialogs.showConfirm(`Delete "${collection.name}"?`, 'This action cannot be undone.');
    if (!confirmed) return;

    try {
      // Get all request IDs that will be deleted (for closing tabs)
      const affectedRequestIds = this.getAllRequestsInFolder(collectionId);

      await window.apiCourier.collection.delete(collectionId);

      // Dispatch deletion events for all affected requests
      for (const requestId of affectedRequestIds) {
        const event = new CustomEvent('request-deleted', {
          detail: { requestId }
        });
        document.dispatchEvent(event);
      }

      const index = this.collections.findIndex(c => c.id === collectionId);
      if (index !== -1) {
        this.collections.splice(index, 1);
      }
    } catch (error) {
      console.error('Failed to delete collection:', error);
      this.onShowError('Failed to delete collection');
    }
  }
}
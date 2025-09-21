import { Collection, ApiRequest } from '../../shared/types';
import { modal } from '../utils/modal';

interface CollectionTreeState {
  expandedFolders: Set<string>;
  searchTerm: string;
  draggedItem?: string;
}

export class CollectionsManager {
  private collections: Collection[] = [];
  private selectedCollectionId?: string;
  private treeState: CollectionTreeState = {
    expandedFolders: new Set(),
    searchTerm: '',
    draggedItem: undefined
  };

  initialize(): void {
    this.setupCollectionEvents();
    this.setupSearchFunctionality();
    this.setupKeyboardShortcuts();
    this.renderCollections();
  }

  private setupCollectionEvents(): void {
    const addButton = document.getElementById('add-collection');
    const collectionsTree = document.getElementById('collections-tree');

    if (addButton) {
      addButton.addEventListener('click', (e) => {
        this.showCreateMenu(e);
      });
    }

    if (collectionsTree) {
      // Click events
      collectionsTree.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Handle folder expand/collapse
        if (target.classList.contains('folder-toggle')) {
          const folderId = target.dataset.folderId;
          if (folderId) {
            this.toggleFolder(folderId);
          }
          return;
        }

        // Handle collection selection and folder toggle
        if (target.classList.contains('collection-item') || target.closest('.collection-item')) {
          const collectionElement = target.classList.contains('collection-item')
            ? target
            : target.closest('.collection-item') as HTMLElement;
          const collectionId = collectionElement?.dataset.collectionId;
          if (collectionId) {
            const collection = this.findCollectionById(collectionId);

            // Check if we clicked on action buttons or their children
            const isActionButton = target.classList.contains('action-btn') ||
                                 target.closest('.action-btn') ||
                                 target.closest('.collection-actions');

            // If it's a folder and we didn't click on action buttons, toggle it
            if (collection && collection.type === 'folder' && !isActionButton) {
              this.toggleFolder(collectionId);
            }

            this.selectCollection(collectionId);
          }
        }

        // Handle action buttons
        if (target.classList.contains('collection-add-folder')) {
          const parentId = target.dataset.parentId;
          this.showCreateDialog('folder', parentId);
        }

        if (target.classList.contains('collection-add-request')) {
          const parentId = target.dataset.parentId;
          this.showCreateDialog('request', parentId);
        }
      });

      // Context menu events
      collectionsTree.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;

        if (collectionElement) {
          const collectionId = collectionElement.dataset.collectionId;
          if (collectionId) {
            this.showContextMenu(e, collectionId);
          }
        }
      });

      // Drag and drop events
      collectionsTree.addEventListener('dragstart', (e) => {
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;
        if (collectionElement) {
          const collectionId = collectionElement.dataset.collectionId;
          if (collectionId) {
            this.treeState.draggedItem = collectionId;
            e.dataTransfer?.setData('text/plain', collectionId);
            collectionElement.classList.add('dragging');
          }
        }
      });

      collectionsTree.addEventListener('dragend', (e) => {
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;
        if (collectionElement) {
          collectionElement.classList.remove('dragging');
        }
        this.treeState.draggedItem = undefined;
      });

      collectionsTree.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;
        if (collectionElement) {
          const collection = this.findCollectionById(collectionElement.dataset.collectionId || '');
          if (collection && collection.type === 'folder') {
            collectionElement.classList.add('drag-over');
          }
        }
      });

      collectionsTree.addEventListener('dragleave', (e) => {
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;
        if (collectionElement) {
          collectionElement.classList.remove('drag-over');
        }
      });

      collectionsTree.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const collectionElement = target.closest('.collection-item') as HTMLElement;
        if (collectionElement) {
          collectionElement.classList.remove('drag-over');
          const targetId = collectionElement.dataset.collectionId;
          const draggedId = this.treeState.draggedItem;
          if (targetId && draggedId && targetId !== draggedId) {
            this.moveCollection(draggedId, targetId);
          }
        }
      });
    }
  }

  private setupSearchFunctionality(): void {
    // Add Import button to header
    const collectionsHeader = document.querySelector('.collections-panel .panel-header');
    if (collectionsHeader) {
      const importButton = document.createElement('button');
      importButton.className = 'btn-import';
      importButton.textContent = 'Import';
      importButton.title = 'Import collections (coming soon)';

      // Insert import button before the add button
      const addButton = document.getElementById('add-collection');
      if (addButton) {
        collectionsHeader.insertBefore(importButton, addButton);
      }
    }

    // Add search container above collections tree
    const collectionsTree = document.getElementById('collections-tree');
    if (!collectionsTree) return;

    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
      <input type="text" id="collections-search" class="search-input" placeholder="Search collections">
      <span class="search-icon">🔍</span>
      <button class="help-btn" id="collections-help" title="Keyboard shortcuts">?</button>
    `;

    // Insert search container before the collections tree
    collectionsTree.parentNode?.insertBefore(searchContainer, collectionsTree);

    const searchInput = document.getElementById('collections-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.treeState.searchTerm = target.value.toLowerCase();
        this.renderCollections();
      });

      // Clear search on escape
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.treeState.searchTerm = '';
          this.renderCollections();
        }
      });
    }

    // Help button
    const helpButton = document.getElementById('collections-help');
    if (helpButton) {
      helpButton.addEventListener('click', () => {
        this.showKeyboardShortcuts();
      });
    }
  }

  private showKeyboardShortcuts(): void {
    const shortcuts = [
      { key: 'Ctrl/Cmd + N', description: 'New folder' },
      { key: 'Ctrl/Cmd + Shift + N', description: 'New request' },
      { key: 'Ctrl/Cmd + F', description: 'Search collections' },
      { key: 'Ctrl/Cmd + D', description: 'Duplicate selected' },
      { key: 'Ctrl/Cmd + E', description: 'Export selected' },
      { key: 'F2', description: 'Rename selected' },
      { key: 'Delete', description: 'Delete selected' },
      { key: '↑/↓', description: 'Navigate up/down' },
      { key: '→', description: 'Expand folder' },
      { key: '←', description: 'Collapse folder' },
      { key: 'Escape', description: 'Clear search' }
    ];

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 24px;
      min-width: 350px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Keyboard Shortcuts';
    title.style.cssText = `
      margin: 0 0 16px 0;
      color: var(--text-primary);
      font-size: 16px;
      font-weight: 600;
      text-align: center;
    `;

    const shortcutsList = document.createElement('div');
    shortcutsList.style.cssText = `
      display: grid;
      gap: 8px;
    `;

    shortcuts.forEach(shortcut => {
      const item = document.createElement('div');
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--bg-tertiary);
        border-radius: 4px;
        font-size: 12px;
      `;

      const keySpan = document.createElement('span');
      keySpan.textContent = shortcut.key;
      keySpan.style.cssText = `
        font-family: monospace;
        background: var(--bg-primary);
        color: var(--primary-color);
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 600;
      `;

      const descSpan = document.createElement('span');
      descSpan.textContent = shortcut.description;
      descSpan.style.color = 'var(--text-secondary)';

      item.appendChild(keySpan);
      item.appendChild(descSpan);
      shortcutsList.appendChild(item);
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      width: 100%;
      margin-top: 16px;
      padding: 8px 16px;
      background: var(--primary-color);
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 14px;
    `;

    const cleanup = () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };

    closeButton.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
      }
    });

    content.appendChild(title);
    content.appendChild(shortcutsList);
    content.appendChild(closeButton);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  }

  private toggleFolder(folderId: string): void {
    if (this.treeState.expandedFolders.has(folderId)) {
      this.treeState.expandedFolders.delete(folderId);
    } else {
      this.treeState.expandedFolders.add(folderId);
    }
    this.renderCollections();
  }

  private async moveCollection(draggedId: string, targetFolderId: string): Promise<void> {
    const draggedCollection = this.findCollectionById(draggedId);
    const targetFolder = this.findCollectionById(targetFolderId);

    if (!draggedCollection || !targetFolder || targetFolder.type !== 'folder') {
      return;
    }

    // Prevent moving a folder into itself or its descendants
    if (this.isDescendant(targetFolderId, draggedId)) {
      this.showError('Cannot move folder into itself or its descendants');
      return;
    }

    try {
      await window.apiCourier.collection.update(draggedId, { parentId: targetFolderId });
      draggedCollection.parentId = targetFolderId;
      this.renderCollections();
    } catch (error) {
      console.error('Failed to move collection:', error);
      this.showError('Failed to move collection');
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

  private async duplicateCollection(collectionId: string): Promise<void> {
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

      // If it's a folder, duplicate all children recursively
      if (collection.type === 'folder') {
        await this.duplicateChildren(collection.id, newCollection.id);
      }

      this.renderCollections();
    } catch (error) {
      console.error('Failed to duplicate collection:', error);
      this.showError('Failed to duplicate collection');
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

  private exportCollection(collectionId: string): void {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const exportData = {
      version: '1.0',
      type: 'api-courier-export',
      timestamp: new Date().toISOString(),
      collection: this.buildExportData(collection)
    };

    // Create and download JSON file
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

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when not in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd + N - New collection
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        this.showCreateDialog('folder');
      }

      // Ctrl/Cmd + Shift + N - New request
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        this.showCreateDialog('request');
      }

      // Delete key - Delete selected collection
      if (e.key === 'Delete' && this.selectedCollectionId) {
        e.preventDefault();
        this.deleteCollection(this.selectedCollectionId);
      }

      // F2 - Rename selected collection
      if (e.key === 'F2' && this.selectedCollectionId) {
        e.preventDefault();
        this.renameCollection(this.selectedCollectionId);
      }

      // Ctrl/Cmd + D - Duplicate selected collection
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && this.selectedCollectionId) {
        e.preventDefault();
        this.duplicateCollection(this.selectedCollectionId);
      }

      // Ctrl/Cmd + E - Export selected collection
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && this.selectedCollectionId) {
        e.preventDefault();
        this.exportCollection(this.selectedCollectionId);
      }

      // Ctrl/Cmd + F - Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('collections-search') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Arrow keys for navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.handleArrowNavigation(e);
      }
    });
  }

  private handleArrowNavigation(e: KeyboardEvent): void {
    const collections = this.getVisibleCollections();
    const currentIndex = collections.findIndex(c => c.id === this.selectedCollectionId);

    if (currentIndex === -1 && collections.length > 0) {
      // No selection, select first item
      this.selectCollection(collections[0].id);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        if (currentIndex > 0) {
          this.selectCollection(collections[currentIndex - 1].id);
          e.preventDefault();
        }
        break;

      case 'ArrowDown':
        if (currentIndex < collections.length - 1) {
          this.selectCollection(collections[currentIndex + 1].id);
          e.preventDefault();
        }
        break;

      case 'ArrowRight':
        const current = collections[currentIndex];
        if (current && current.type === 'folder' && !this.treeState.expandedFolders.has(current.id)) {
          this.toggleFolder(current.id);
          e.preventDefault();
        }
        break;

      case 'ArrowLeft':
        const currentFolder = collections[currentIndex];
        if (currentFolder && currentFolder.type === 'folder' && this.treeState.expandedFolders.has(currentFolder.id)) {
          this.toggleFolder(currentFolder.id);
          e.preventDefault();
        }
        break;
    }
  }

  private getVisibleCollections(): Collection[] {
    const getCollectionsInOrder = (parentId?: string): Collection[] => {
      const items: Collection[] = [];
      const children = this.collections
        .filter(c => c.parentId === parentId)
        .sort((a, b) => {
          // Folders first, then requests
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      for (const child of children) {
        items.push(child);
        if (child.type === 'folder' && this.treeState.expandedFolders.has(child.id)) {
          items.push(...getCollectionsInOrder(child.id));
        }
      }

      return items;
    };

    return getCollectionsInOrder();
  }

  private showCreateMenu(event: MouseEvent): void {
    const button = event.target as HTMLElement;
    const rect = button.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'create-menu';
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.backgroundColor = 'var(--bg-tertiary)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '150px';
    menu.style.overflow = 'hidden';

    const createOptions = [
      {
        label: '📁 New Folder',
        action: () => this.showCreateDialog('folder'),
        description: 'Create a new folder'
      },
      {
        label: '📄 New Request',
        action: () => this.showCreateDialog('request'),
        description: 'Create a new API request'
      }
    ];

    createOptions.forEach((option, index) => {
      const item = document.createElement('div');
      item.className = 'create-menu-item';
      item.style.cssText = `
        padding: 12px 16px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background-color 0.15s ease;
      `;

      const label = document.createElement('span');
      label.textContent = option.label;
      label.style.fontWeight = '500';

      item.appendChild(label);
      item.title = option.description;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--primary-color)';
        item.style.color = 'white';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
        item.style.color = 'var(--text-primary)';
      });

      item.addEventListener('click', () => {
        option.action();
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
      });

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Close menu when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  }

  private async showCreateDialog(type: 'folder' | 'request' = 'folder', parentId?: string): Promise<void> {
    const name = await modal.show(`Create ${type}`, `Enter ${type} name`);
    if (!name) return;

    try {
      let collectionData: any = {
        name,
        type,
        parentId,
      };

      // If creating a request, add default request structure
      if (type === 'request') {
        collectionData.request = {
          id: crypto.randomUUID(),
          name: name,
          method: 'GET',
          url: '',
          headers: {},
          params: {},
          body: {
            type: 'none',
            content: ''
          },
          auth: {
            type: 'none',
            config: {}
          }
        };
      }

      const newCollection = await window.apiCourier.collection.create(collectionData);

      this.collections.push(newCollection);
      this.renderCollections();

      // Auto-select the new collection
      this.selectCollection(newCollection.id);
    } catch (error) {
      console.error('Failed to create collection:', error);
      this.showError('Failed to create collection');
    }
  }

  private showContextMenu(event: MouseEvent, collectionId: string): void {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.backgroundColor = 'var(--bg-tertiary)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '4px';
    menu.style.padding = '8px 0';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '150px';

    const actions = [];

    if (collection.type === 'folder') {
      actions.push(
        { label: '📁 Add Folder', action: () => this.showCreateDialog('folder', collectionId) },
        { label: '📄 Add Request', action: () => this.showCreateDialog('request', collectionId) },
        { label: '---', action: null }, // Separator
        { label: '📋 Duplicate Folder', action: () => this.duplicateCollection(collectionId) },
        { label: '📤 Export Folder', action: () => this.exportCollection(collectionId) },
        { label: '---', action: null }, // Separator
      );
    } else {
      actions.push(
        { label: '📋 Duplicate Request', action: () => this.duplicateCollection(collectionId) },
        { label: '📤 Export Request', action: () => this.exportCollection(collectionId) },
        { label: '---', action: null }, // Separator
      );
    }

    actions.push(
      { label: '✏️ Rename', action: () => this.renameCollection(collectionId) },
      { label: '🗑️ Delete', action: () => this.deleteCollection(collectionId) }
    );

    actions.forEach(action => {
      const item = document.createElement('div');

      if (action.label === '---') {
        // Create separator
        item.className = 'context-menu-separator';
        item.style.cssText = `
          height: 1px;
          background: var(--border-color);
          margin: 4px 0;
        `;
      } else {
        item.textContent = action.label;
        item.className = 'context-menu-item';
        item.style.cssText = `
          padding: 8px 16px;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--hover-color)';
        });

        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });

        if (action.action) {
          item.addEventListener('click', () => {
            action.action();
            if (document.body.contains(menu)) {
              document.body.removeChild(menu);
            }
          });
        }
      }

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const handleClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  }

  private async renameCollection(collectionId: string): Promise<void> {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const newName = await modal.show('Rename', collection.name);
    if (!newName || newName === collection.name) return;

    try {
      await window.apiCourier.collection.update(collectionId, { name: newName });
      collection.name = newName;
      this.renderCollections();
    } catch (error) {
      console.error('Failed to rename collection:', error);
      this.showError('Failed to rename collection');
    }
  }

  private async deleteCollection(collectionId: string): Promise<void> {
    const collection = this.findCollectionById(collectionId);
    if (!collection) return;

    const confirmed = await this.showConfirm(`Delete "${collection.name}"?`, 'This action cannot be undone.');
    if (!confirmed) return;

    try {
      await window.apiCourier.collection.delete(collectionId);

      // If this was a request collection, notify tabs to close any open tabs for this request
      if (collection.type === 'request' && collection.request) {
        const event = new CustomEvent('request-deleted', {
          detail: { requestId: collection.request.id }
        });
        document.dispatchEvent(event);
      }

      this.collections = this.collections.filter(c => c.id !== collectionId);
      this.renderCollections();
    } catch (error) {
      console.error('Failed to delete collection:', error);
      this.showError('Failed to delete collection');
    }
  }

  private selectCollection(collectionId: string): void {
    this.selectedCollectionId = collectionId;
    this.renderCollections();

    const collection = this.findCollectionById(collectionId);
    if (collection && collection.type === 'request' && collection.request) {
      // Notify that a collection request should be opened in a tab
      const event = new CustomEvent('open-request-in-tab', {
        detail: {
          request: collection.request,
          collectionId: collection.id
        }
      });
      document.dispatchEvent(event);
    }
  }

  private renderCollections(): void {
    const tree = document.getElementById('collections-tree');
    if (!tree) return;

    let collectionsToShow = this.collections;

    // Apply search filter
    if (this.treeState.searchTerm) {
      collectionsToShow = this.getFilteredCollections();
    }

    const rootCollections = collectionsToShow.filter(c => !c.parentId);

    if (rootCollections.length === 0) {
      const message = this.treeState.searchTerm
        ? 'No collections match your search.'
        : 'No collections yet. Click + to create one.';
      tree.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    tree.innerHTML = '';
    rootCollections.forEach(collection => {
      const element = this.createCollectionElement(collection, 0);
      tree.appendChild(element);
    });
  }

  private getFilteredCollections(): Collection[] {
    const searchTerm = this.treeState.searchTerm;
    const matchingCollections = this.collections.filter(collection =>
      collection.name.toLowerCase().includes(searchTerm)
    );

    // Include parents of matching collections
    const result = new Set(matchingCollections);
    matchingCollections.forEach(collection => {
      let parent = this.findCollectionById(collection.parentId || '');
      while (parent) {
        result.add(parent);
        parent = this.findCollectionById(parent.parentId || '');
      }
    });

    return Array.from(result);
  }

  private createCollectionElement(collection: Collection, depth: number): HTMLElement {
    const element = document.createElement('div');
    element.className = 'collection-item';
    element.dataset.collectionId = collection.id;
    element.draggable = true;

    // Calculate proper indentation: root level items (folders and requests) start at same level
    const baseIndent = 12;
    const indentPerLevel = 20;
    element.style.paddingLeft = (depth * indentPerLevel + baseIndent) + 'px';

    if (collection.id === this.selectedCollectionId) {
      element.classList.add('selected');
    }

    if (collection.type === 'folder') {
      element.classList.add('folder');
    }

    // Create the main content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'collection-content';

    // Folder toggle arrow (only for folders)
    if (collection.type === 'folder') {
      const toggle = document.createElement('span');
      toggle.className = 'folder-toggle';
      toggle.dataset.folderId = collection.id;
      const isExpanded = this.treeState.expandedFolders.has(collection.id);
      toggle.textContent = isExpanded ? '▼' : '▶';
      toggle.title = isExpanded ? 'Collapse folder' : 'Expand folder';
      contentWrapper.appendChild(toggle);
    } else {
      // Add spacing for requests to align with folders
      // Only add spacer if we're nested (depth > 0), not at root level
      if (depth > 0) {
        const spacer = document.createElement('span');
        spacer.className = 'folder-spacer';
        contentWrapper.appendChild(spacer);
      }
    }

    // Collection icon
    const icon = document.createElement('span');
    icon.className = 'collection-icon';

    if (collection.type === 'folder') {
      const isExpanded = this.treeState.expandedFolders.has(collection.id);
      icon.textContent = isExpanded ? '📂' : '📁';
    } else {
      // Use method-specific icons for requests
      const method = collection.request?.method || 'GET';
      const methodIcons: Record<string, string> = {
        'GET': '📄',
        'POST': '📝',
        'PUT': '✏️',
        'PATCH': '🔧',
        'DELETE': '🗑️',
        'HEAD': '👁️',
        'OPTIONS': '⚙️'
      };
      icon.textContent = methodIcons[method] || '📄';
    }

    contentWrapper.appendChild(icon);

    // Collection name
    const name = document.createElement('span');
    name.className = 'collection-name';
    name.textContent = collection.name;

    // Highlight search matches
    if (this.treeState.searchTerm && collection.name.toLowerCase().includes(this.treeState.searchTerm)) {
      name.classList.add('search-highlight');
    }

    contentWrapper.appendChild(name);

    // Action buttons (show on hover for folders)
    if (collection.type === 'folder') {
      const actions = document.createElement('div');
      actions.className = 'collection-actions';

      const addFolder = document.createElement('button');
      addFolder.className = 'action-btn collection-add-folder';
      addFolder.dataset.parentId = collection.id;
      addFolder.title = 'Add folder';
      addFolder.textContent = '📁+';

      const addRequest = document.createElement('button');
      addRequest.className = 'action-btn collection-add-request';
      addRequest.dataset.parentId = collection.id;
      addRequest.title = 'Add request';
      addRequest.textContent = '📄+';

      actions.appendChild(addFolder);
      actions.appendChild(addRequest);
      contentWrapper.appendChild(actions);
    }

    element.appendChild(contentWrapper);

    const container = document.createElement('div');
    container.className = 'collection-container';
    container.appendChild(element);

    // Add children if it's a folder and it's expanded (or if we're searching)
    if (collection.type === 'folder') {
      const isExpanded = this.treeState.expandedFolders.has(collection.id);
      const isSearching = this.treeState.searchTerm.length > 0;

      if (isExpanded || isSearching) {
        const children = this.collections.filter(c => c.parentId === collection.id);

        // Filter children based on search if needed
        let childrenToShow = children;
        if (isSearching) {
          const filteredCollections = this.getFilteredCollections();
          childrenToShow = children.filter(child =>
            filteredCollections.some(fc => fc.id === child.id)
          );
        }

        if (childrenToShow.length > 0) {
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'collection-children';

          childrenToShow.forEach(child => {
            const childElement = this.createCollectionElement(child, depth + 1);
            childrenContainer.appendChild(childElement);
          });

          container.appendChild(childrenContainer);
        }
      }
    }

    return container;
  }

  private findCollectionById(id: string): Collection | undefined {
    return this.collections.find(c => c.id === id);
  }

  setCollections(collections: Collection[]): void {
    this.collections = collections;

    // Auto-expand all folders by default to show the hierarchical structure
    this.collections.forEach(collection => {
      if (collection.type === 'folder') {
        this.treeState.expandedFolders.add(collection.id);
      }
    });

    this.renderCollections();
  }

  getCollections(): Collection[] {
    return this.collections;
  }

  getSelectedCollection(): Collection | undefined {
    return this.findCollectionById(this.selectedCollectionId || '');
  }

  private showError(message: string): void {
    // Simple error notification - could be enhanced with a toast system
    const errorDiv = document.createElement('div');
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
    `;

    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 3000);
  }

  private async showConfirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 24px;
        min-width: 300px;
        max-width: 500px;
      `;

      const titleEl = document.createElement('h3');
      titleEl.textContent = title;
      titleEl.style.cssText = `
        margin: 0 0 8px 0;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 600;
      `;

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        margin: 0 0 20px 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.4;
      `;

      const buttonsContainer = document.createElement('div');
      buttonsContainer.style.cssText = `
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      `;

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.cssText = `
        padding: 8px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-primary);
        cursor: pointer;
        font-size: 14px;
      `;

      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Delete';
      confirmButton.style.cssText = `
        padding: 8px 16px;
        background: var(--error-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 14px;
      `;

      const cleanup = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      cancelButton.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmButton.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      buttonsContainer.appendChild(cancelButton);
      buttonsContainer.appendChild(confirmButton);
      content.appendChild(titleEl);
      content.appendChild(messageEl);
      content.appendChild(buttonsContainer);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    });
  }

  updateCollectionRequest(collectionId: string, updatedRequest: ApiRequest): void {
    const collection = this.findCollectionById(collectionId);
    if (collection && collection.type === 'request' && collection.request) {
      // Update the collection's request with the new data
      collection.request = { ...collection.request, ...updatedRequest };
      collection.updatedAt = new Date();

      // Trigger a save by dispatching an event
      const event = new CustomEvent('collections-changed', {
        detail: { collections: this.collections }
      });
      document.dispatchEvent(event);
    }
  }
}
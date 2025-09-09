import { EventBus } from '../utils/event-bus';
import { Collection, Request } from '../../shared/types';
import { Modal } from '../utils/modal';

export class CollectionsManager {
  private collections: Collection[] = [];
  private selectedRequest: Request | null = null;
  private expandedFolders: Set<string> = new Set();

  constructor(private eventBus: EventBus) {}

  initialize(): void {
    this.setupEventListeners();
    this.setupImportButton();
    this.setupNewCollectionButton();
    this.loadExpandedFolders();
  }

  private setupEventListeners(): void {
    this.eventBus.on('collections:loaded', (collections: Collection[]) => {
      this.collections = collections;
      this.renderCollections();
    });

    this.eventBus.on('collection:created', (collection: Collection) => {
      this.collections.push(collection);
      this.renderCollections();
      this.saveCollection(collection);
    });

    this.eventBus.on('request:selected', (request: Request) => {
      this.selectedRequest = request;
      this.highlightSelectedRequest(request);
    });

    // Auto-save request changes when they are modified
    this.eventBus.on('request:changed', (request: Request) => {
      this.autoSaveRequest(request);
    });
  }

  private setupImportButton(): void {
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        try {
          const collection = await window.electronAPI.importCollection();
          if (collection) {
            this.collections.push(collection);
            this.renderCollections();
            await this.saveCollection(collection);
            this.eventBus.emit('toast:show', {
              message: `Collection "${collection.name}" imported successfully`,
              type: 'success'
            });
          }
        } catch (error) {
          console.error('Failed to import collection:', error);
          this.eventBus.emit('toast:show', {
            message: 'Failed to import collection',
            type: 'error'
          });
        }
      });
    }
  }

  private setupNewCollectionButton(): void {
    const newCollectionBtn = document.getElementById('newCollectionBtn');
    if (newCollectionBtn) {
      newCollectionBtn.addEventListener('click', () => {
        this.createNewCollection();
      });
    }
  }

  private async createNewCollection(): Promise<void> {
    const collection: Collection = {
      id: this.generateId(),
      name: 'New Collection',
      children: [],
      requests: [],
      type: 'collection'
    };
    
    this.collections.push(collection);
    this.renderCollections();
    await this.saveCollection(collection);
    
    // Start inline editing immediately
    setTimeout(() => this.startInlineEdit(collection.id, 'collection'), 100);
  }

  private async createNewFolder(parentId?: string): Promise<void> {
    const folder: Collection = {
      id: this.generateId(),
      name: 'New Folder',
      children: [],
      requests: [],
      type: 'folder',
      parentId
    };

    // Expand parent if creating inside a folder
    if (parentId) {
      this.expandedFolders.add(parentId);
      this.addToParent(folder, parentId);
    } else {
      this.collections.push(folder);
    }

    // Expand the new folder by default
    this.expandedFolders.add(folder.id);

    this.renderCollections();
    
    // Save the root collection that contains this folder
    const rootCollection = this.findRootCollection(folder.parentId!);
    if (rootCollection) {
      await this.saveCollection(rootCollection);
    }
    
    // Start inline editing immediately
    setTimeout(() => this.startInlineEdit(folder.id, 'collection'), 100);
  }

  private async createNewRequest(parentId?: string): Promise<void> {
    const request: Request = {
      id: this.generateId(),
      name: 'New Request',
      method: 'GET',
      url: '',
      headers: {},
      parentId
    };

    // Expand parent if creating inside a folder
    if (parentId) {
      this.expandedFolders.add(parentId);
      this.addRequestToParent(request, parentId);
    } else {
      // Create a default collection if none exists
      if (this.collections.length === 0) {
        await this.createNewCollection();
      }
      if (this.collections.length > 0) {
        this.expandedFolders.add(this.collections[0].id);
        this.addRequestToParent(request, this.collections[0].id);
      }
    }

    this.renderCollections();
    
    // Save the root collection that contains this request
    const rootCollection = this.findRootCollection(request.parentId || request.collectionId || '');
    if (rootCollection) {
      await this.saveCollection(rootCollection);
    } else {
      // Fallback: save request directly if no parent collection found
      await this.saveRequest(request);
    }
    
    // Start inline editing immediately
    setTimeout(() => this.startInlineEdit(request.id, 'request'), 100);
  }

  private addToParent(item: Collection, parentId: string): void {
    const addToCollection = (collections: Collection[]): boolean => {
      for (const collection of collections) {
        if (collection.id === parentId) {
          if (!collection.children) collection.children = [];
          collection.children.push(item);
          return true;
        }
        if (collection.children && addToCollection(collection.children)) {
          return true;
        }
      }
      return false;
    };

    addToCollection(this.collections);
  }

  private addRequestToParent(request: Request, parentId: string): void {
    const addToCollection = (collections: Collection[]): boolean => {
      for (const collection of collections) {
        if (collection.id === parentId) {
          if (!collection.requests) collection.requests = [];
          collection.requests.push(request);
          request.collectionId = collection.id;
          return true;
        }
        if (collection.children && addToCollection(collection.children)) {
          return true;
        }
      }
      return false;
    };

    addToCollection(this.collections);
  }

  private renderCollections(): void {
    const container = document.getElementById('collectionsTree');
    if (!container) return;

    container.innerHTML = '';

    if (this.collections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span>📁</span>
          <p>No collections yet</p>
          <small>Import or create a new collection to get started</small>
        </div>
      `;
      return;
    }

    this.collections.forEach(collection => {
      const element = this.createCollectionElement(collection, 0);
      container.appendChild(element);
    });

    // Add event listeners for request items after rendering
    this.attachRequestEventListeners();
  }

  private attachCollectionEventListeners(): void {
    // Re-attach event listeners for all collection headers (including children)
    document.querySelectorAll('.collection-header').forEach(header => {
      const collectionId = header.getAttribute('data-id');
      if (!collectionId) return;

      const collection = this.findCollectionById(collectionId);
      if (!collection) return;

      const parentElement = header.parentElement;
      if (parentElement && !parentElement.hasAttribute('data-listeners-attached')) {
        // Mark as having listeners to avoid duplicate attachment
        parentElement.setAttribute('data-listeners-attached', 'true');
        
        // Setup fresh event listeners without cloning
        this.setupCollectionEvents(parentElement, collection);
      }
    });
  }

  private attachRequestEventListeners(): void {
    document.querySelectorAll('.request-item').forEach(item => {
      const requestId = item.getAttribute('data-request-id');
      if (requestId && !item.hasAttribute('data-listeners-attached')) {
        // Mark as having listeners to avoid duplicate attachment
        item.setAttribute('data-listeners-attached', 'true');
        
        // Single click to select request
        item.addEventListener('click', (e) => {
          // Don't trigger if clicking on action button
          const actionBtn = item.querySelector('[data-action="request-menu"]');
          if (e.target === actionBtn || (actionBtn && actionBtn.contains(e.target as Node))) {
            return;
          }
          
          const request = this.findRequestById(requestId);
          if (!request) return;
          
          // Immediate selection for better performance
          this.eventBus.emit('request:selected', request);
        });

        // Double click to rename
        item.addEventListener('dblclick', (e) => {
          // Don't trigger if clicking on action button
          const actionBtn = item.querySelector('[data-action="request-menu"]');
          if (e.target === actionBtn || (actionBtn && actionBtn.contains(e.target as Node))) {
            return;
          }
          
          const request = this.findRequestById(requestId);
          if (!request) return;
          
          this.startInlineEdit(request.id, 'request');
        });

        // Hover effects for actions
        item.addEventListener('mouseenter', () => {
          const actions = item.querySelector('.request-actions') as HTMLElement;
          if (actions) actions.style.opacity = '1';
        });

        item.addEventListener('mouseleave', () => {
          const actions = item.querySelector('.request-actions') as HTMLElement;
          if (actions) actions.style.opacity = '0';
        });

        // Context menu for requests
        const actionBtn = item.querySelector('[data-action="request-menu"]') as HTMLElement;
        if (actionBtn && !actionBtn.hasAttribute('data-listeners-attached')) {
          actionBtn.setAttribute('data-listeners-attached', 'true');
          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const request = this.findRequestById(requestId);
            if (request) {
              this.showRequestContextMenu(e as MouseEvent, request);
            }
          });
        }

        // Right-click context menu
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const request = this.findRequestById(requestId);
          if (request) {
            this.showRequestContextMenu(e as MouseEvent, request);
          }
        });
      }
    });
  }

  private findRequestById(id: string): Request | null {
    const search = (collections: Collection[]): Request | null => {
      for (const collection of collections) {
        if (collection.requests) {
          for (const request of collection.requests) {
            if (request.id === id) return request;
          }
        }
        if (collection.children) {
          const found = search(collection.children);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this.collections);
  }

  private showRequestContextMenu(event: MouseEvent, request: Request): void {
    const menuItems = [
      {
        label: 'Duplicate',
        icon: '📋',
        action: () => this.duplicateRequest(request)
      },
      {
        label: 'Rename',
        icon: '✏️',
        action: () => this.startInlineEdit(request.id, 'request')
      },
      {
        label: 'Delete',
        icon: '🗑️',
        action: () => this.deleteRequest(request.id)
      }
    ];

    Modal.showMenu(event.clientX, event.clientY, menuItems);
  }

  private async renameRequest(request: Request): Promise<void> {
    const newName = await Modal.prompt('Rename request:', request.name);
    if (newName && newName.trim() && newName.trim() !== request.name) {
      request.name = newName.trim();
      this.renderCollections();
      
      // Save the root collection that contains this request
      const rootCollection = this.findRootCollection(request.parentId || request.collectionId || '');
      if (rootCollection) {
        await this.saveCollection(rootCollection);
      } else {
        await this.saveRequest(request);
      }
    }
  }

  private async duplicateRequest(request: Request): Promise<void> {
    const duplicate: Request = {
      ...JSON.parse(JSON.stringify(request)),
      id: this.generateId(),
      name: `${request.name} Copy`
    };

    // Add to the same parent and expand parent folder
    if (request.parentId) {
      this.expandedFolders.add(request.parentId);
      this.addRequestToParent(duplicate, request.parentId);
    } else if (request.collectionId) {
      this.expandedFolders.add(request.collectionId);
      this.addRequestToParent(duplicate, request.collectionId);
    }

    this.renderCollections();
    
    // Save the root collection that contains this request
    const rootCollection = this.findRootCollection(duplicate.parentId || duplicate.collectionId || '');
    if (rootCollection) {
      await this.saveCollection(rootCollection);
    } else {
      await this.saveRequest(duplicate);
    }
    
    // Start inline editing immediately
    setTimeout(() => this.startInlineEdit(duplicate.id, 'request'), 100);
  }

  private async deleteRequest(id: string): Promise<void> {
    const request = this.findRequestById(id);
    if (!request) return;

    const confirmed = await Modal.confirm(
      'Delete Request',
      `Are you sure you want to delete "${request.name}"?`
    );

    if (confirmed) {
      try {
        await window.electronAPI.deleteRequest(id);
        this.removeRequestById(id);
        this.renderCollections();
        
        // Notify TabsManager to close any open tab for this request
        this.eventBus.emit('request:deleted', id);
        
        this.eventBus.emit('toast:show', {
          message: `Request "${request.name}" deleted`,
          type: 'success'
        });
      } catch (error) {
        console.error('Failed to delete request:', error);
        this.eventBus.emit('toast:show', {
          message: 'Failed to delete request',
          type: 'error'
        });
      }
    }
  }

  private removeRequestById(id: string): boolean {
    const remove = (collections: Collection[]): boolean => {
      for (const collection of collections) {
        if (collection.requests) {
          const index = collection.requests.findIndex(r => r.id === id);
          if (index !== -1) {
            collection.requests.splice(index, 1);
            return true;
          }
        }
        if (collection.children && remove(collection.children)) {
          return true;
        }
      }
      return false;
    };

    return remove(this.collections);
  }

  private createCollectionElement(collection: Collection, depth: number = 0): HTMLElement {
    const div = document.createElement('div');
    div.className = 'collection-item';
    div.style.marginLeft = `${depth * 16}px`;

    const icon = collection.type === 'collection' ? '📁' : '📂';
    const isExpanded = this.expandedFolders.has(collection.id);
    
    // Create the main structure first
    const header = document.createElement('div');
    header.className = 'collection-header';
    header.setAttribute('data-id', collection.id);
    header.innerHTML = `
      <span class="collection-toggle" style="margin-right: 4px; cursor: pointer; font-size: 12px; color: var(--text-secondary);">${isExpanded ? '▼' : '▶'}</span>
      <span class="collection-icon" style="margin-right: 8px;">${icon}</span>
      <span class="collection-name" style="flex: 1; font-size: 13px;">${collection.name}</span>
      <div class="collection-actions" style="opacity: 0; transition: opacity 0.2s;">
        <button class="action-btn" data-action="menu" data-id="${collection.id}" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 2px; font-size: 12px;">⋯</button>
      </div>
    `;
    
    const children = document.createElement('div');
    children.className = 'collection-children';
    children.style.display = isExpanded ? 'block' : 'none';
    
    // Append the rendered content (DocumentFragment)
    const content = this.renderCollectionContent(collection, depth + 1);
    children.appendChild(content);
    
    div.appendChild(header);
    div.appendChild(children);

    // Setup event listeners
    this.setupCollectionEvents(div, collection);

    return div;
  }

  private setupCollectionEvents(element: HTMLElement, collection: Collection): void {
    const header = element.querySelector('.collection-header') as HTMLElement;
    const toggle = element.querySelector('.collection-toggle') as HTMLElement;
    const children = element.querySelector('.collection-children') as HTMLElement;
    const actionBtn = element.querySelector('[data-action="menu"]') as HTMLElement;

    // Single click to expand/collapse
    if (toggle && children) {
      const toggleChildren = () => {
        const isExpanded = this.expandedFolders.has(collection.id);
        if (isExpanded) {
          this.expandedFolders.delete(collection.id);
          children.style.display = 'none';
          toggle.textContent = '▶';
        } else {
          this.expandedFolders.add(collection.id);
          children.style.display = 'block';
          toggle.textContent = '▼';
        }
        // Persist the expanded state
        this.saveExpandedFolders();
      };

      // Single click on header expands/collapses
      header.addEventListener('click', (e) => {
        // Don't trigger if clicking on action button
        if (e.target === actionBtn || (actionBtn && actionBtn.contains(e.target as Node))) {
          return;
        }
        e.stopPropagation();
        toggleChildren();
      });

      // Double click on header renames
      header.addEventListener('dblclick', (e) => {
        if (e.target === actionBtn || (actionBtn && actionBtn.contains(e.target as Node))) {
          return;
        }
        e.stopPropagation();
        this.startInlineEdit(collection.id, 'collection');
      });
    }

    // Show/hide actions on hover
    header.addEventListener('mouseenter', () => {
      const actions = element.querySelector('.collection-actions') as HTMLElement;
      if (actions) actions.style.opacity = '1';
    });

    header.addEventListener('mouseleave', () => {
      const actions = element.querySelector('.collection-actions') as HTMLElement;
      if (actions) actions.style.opacity = '0';
    });

    // Right-click context menu
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, collection);
    });

    // Context menu button
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showContextMenu(e, collection);
      });
    }
  }

  private showContextMenu(event: MouseEvent, collection: Collection): void {
    const menuItems = [
      {
        label: 'New Request',
        icon: '📄',
        action: () => this.createNewRequest(collection.id)
      },
      {
        label: 'New Folder',
        icon: '📁',
        action: () => this.createNewFolder(collection.id)
      },
      {
        label: 'Rename',
        icon: '✏️',
        action: () => this.startInlineEdit(collection.id, 'collection')
      },
      {
        label: 'Duplicate',
        icon: '📋',
        action: () => this.duplicateCollection(collection)
      },
      {
        label: 'Export',
        icon: '📤',
        action: () => this.exportCollection(collection)
      },
      {
        label: 'Delete',
        icon: '🗑️',
        action: () => this.deleteCollection(collection.id)
      }
    ];

    Modal.showMenu(event.clientX, event.clientY, menuItems);
  }

  private renderCollectionContent(collection: Collection, depth: number): DocumentFragment {
    const fragment = document.createDocumentFragment();

    // Render child collections/folders first
    if (collection.children && collection.children.length > 0) {
      collection.children.forEach(child => {
        const childElement = this.createCollectionElement(child, depth);
        fragment.appendChild(childElement);
      });
    }

    // Render requests
    if (collection.requests && collection.requests.length > 0) {
      collection.requests.forEach(request => {
        const isSelected = this.selectedRequest?.id === request.id;
        const requestElement = document.createElement('div');
        requestElement.className = `request-item ${isSelected ? 'selected' : ''}`;
        requestElement.setAttribute('data-request-id', request.id);
        requestElement.style.cssText = `margin-left: ${depth * 16}px; padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; position: relative;`;
        
        requestElement.innerHTML = `
          ${isSelected ? '<div class="request-selection-indicator"></div>' : ''}
          <span class="request-method method-${request.method.toLowerCase()}" 
                style="display: inline-block; width: 40px; font-weight: 600; font-size: 10px; text-transform: uppercase; margin-right: 8px;">
            ${request.method}
          </span>
          <span class="request-name" style="flex: 1;">${request.name}</span>
          <div class="request-actions" style="opacity: 0; transition: opacity 0.2s;">
            <button class="action-btn" data-action="request-menu" data-id="${request.id}" 
                    style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 6px; border-radius: 2px; font-size: 12px; display: flex; align-items: center; justify-content: center;">⋯</button>
          </div>
        `;
        
        fragment.appendChild(requestElement);
      });
    }

    return fragment;
  }

  private async renameCollection(collection: Collection): Promise<void> {
    const newName = await Modal.prompt('Rename collection:', collection.name);
    if (newName && newName.trim() && newName.trim() !== collection.name) {
      collection.name = newName.trim();
      this.renderCollections();
      await this.saveCollection(collection);
    }
  }

  private async duplicateCollection(collection: Collection): Promise<void> {
    const duplicate: Collection = {
      ...JSON.parse(JSON.stringify(collection)),
      id: this.generateId(),
      name: `${collection.name} Copy`,
      type: collection.type || 'collection'
    };

    // Generate new IDs for all children and requests
    this.regenerateIds(duplicate);

    this.collections.push(duplicate);
    
    // Expand the duplicated collection
    this.expandedFolders.add(duplicate.id);
    
    this.renderCollections();
    await this.saveCollection(duplicate);
    
    // Start inline editing immediately
    setTimeout(() => this.startInlineEdit(duplicate.id, 'collection'), 100);
  }

  private regenerateIds(collection: Collection): void {
    collection.id = this.generateId();
    
    if (collection.children) {
      collection.children.forEach(child => this.regenerateIds(child));
    }
    
    if (collection.requests) {
      collection.requests.forEach(request => {
        request.id = this.generateId();
        request.collectionId = collection.id;
      });
    }
  }

  private highlightSelectedRequest(request: Request): void {
    // Remove previous selection
    document.querySelectorAll('.request-item').forEach(item => {
      item.classList.remove('selected');
      const indicator = item.querySelector('.request-selection-indicator');
      if (indicator) {
        indicator.remove();
      }
    });

    // Highlight selected request
    const requestElement = document.querySelector(`[data-request-id="${request.id}"]`);
    if (requestElement) {
      requestElement.classList.add('selected');
      
      // Add selection indicator
      const indicator = document.createElement('div');
      indicator.className = 'request-selection-indicator';
      requestElement.insertBefore(indicator, requestElement.firstChild);
    }
  }

  private async exportCollection(collection: Collection): Promise<void> {
    try {
      const success = await window.electronAPI.exportCollection(collection);
      if (success) {
        this.eventBus.emit('toast:show', {
          message: `Collection "${collection.name}" exported successfully`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Failed to export collection:', error);
      this.eventBus.emit('toast:show', {
        message: 'Failed to export collection',
        type: 'error'
      });
    }
  }

  private async deleteCollection(id: string): Promise<void> {
    const collection = this.findCollectionById(id);
    if (!collection) return;

    const confirmed = await Modal.confirm(
      'Delete Collection',
      `Are you sure you want to delete "${collection.name}"? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        await window.electronAPI.deleteCollection(id);
        this.removeCollectionById(id);
        this.renderCollections();
        
        this.eventBus.emit('toast:show', {
          message: `Collection "${collection.name}" deleted`,
          type: 'success'
        });
      } catch (error) {
        console.error('Failed to delete collection:', error);
        this.eventBus.emit('toast:show', {
          message: 'Failed to delete collection',
          type: 'error'
        });
      }
    }
  }

  private findCollectionById(id: string): Collection | null {
    const search = (collections: Collection[]): Collection | null => {
      for (const collection of collections) {
        if (collection.id === id) return collection;
        if (collection.children) {
          const found = search(collection.children);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this.collections);
  }

  private findRootCollection(childId: string): Collection | null {
    const findRoot = (collections: Collection[], targetId: string): Collection | null => {
      for (const collection of collections) {
        // Check if this collection or any of its children contain the target
        if (this.containsChild(collection, targetId)) {
          // If this collection has no parent, it's the root
          return collection;
        }
      }
      return null;
    };

    return findRoot(this.collections, childId);
  }

  private containsChild(collection: Collection, childId: string): boolean {
    if (collection.id === childId) return true;
    if (collection.children) {
      return collection.children.some(child => this.containsChild(child, childId));
    }
    return false;
  }

  private removeCollectionById(id: string): boolean {
    const remove = (collections: Collection[]): boolean => {
      for (let i = 0; i < collections.length; i++) {
        if (collections[i].id === id) {
          collections.splice(i, 1);
          return true;
        }
        if (collections[i].children && remove(collections[i].children!)) {
          return true;
        }
      }
      return false;
    };

    return remove(this.collections);
  }

  private async saveCollection(collection: Collection): Promise<void> {
    try {
      await window.electronAPI.saveCollection(collection);
    } catch (error) {
      console.error('Failed to save collection:', error);
      throw error;
    }
  }

  private async saveRequest(request: Request): Promise<void> {
    try {
      await window.electronAPI.saveRequest(request);
    } catch (error) {
      console.error('Failed to save request:', error);
      throw error;
    }
  }

  private async autoSaveRequest(request: Request): Promise<void> {
    try {
      // Also update the request in the local collections structure
      this.updateRequestInCollections(request);
      
      // Save to disk
      await this.saveRequest(request);
      console.debug('Auto-saved request:', request.name);
    } catch (error) {
      console.error('Failed to auto-save request:', error);
    }
  }

  private updateRequestInCollections(updatedRequest: Request): void {
    const updateInCollection = (collection: Collection): boolean => {
      // Check requests in this collection
      if (collection.requests) {
        const requestIndex = collection.requests.findIndex(r => r.id === updatedRequest.id);
        if (requestIndex >= 0) {
          collection.requests[requestIndex] = updatedRequest;
          return true;
        }
      }

      // Check child collections recursively
      if (collection.children) {
        for (const child of collection.children) {
          if (updateInCollection(child)) {
            return true;
          }
        }
      }

      return false;
    };

    // Update in all collections
    for (const collection of this.collections) {
      if (updateInCollection(collection)) {
        break; // Found and updated, no need to continue
      }
    }
  }

  private startInlineEdit(itemId: string, type: 'collection' | 'request'): void {
    const selector = type === 'collection' ? 
      `.collection-header[data-id="${itemId}"] .collection-name` :
      `.request-item[data-request-id="${itemId}"] .request-name`;
    
    const nameElement = document.querySelector(selector) as HTMLElement;
    if (!nameElement) return;

    const currentName = nameElement.textContent || '';
    const originalParent = nameElement.parentElement;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'inline-edit-input';
    input.style.cssText = `
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--primary);
      border-radius: 2px;
      padding: 2px 4px;
      font-size: 13px;
      width: 100%;
      outline: none;
    `;

    // Replace name element with input
    originalParent?.replaceChild(input, nameElement);
    
    // Focus and select all text
    input.focus();
    input.select();

    // Handle save/cancel
    const saveEdit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        if (type === 'collection') {
          const collection = this.findCollectionById(itemId);
          if (collection) {
            collection.name = newName;
            await this.saveCollection(collection);
          }
        } else {
          const request = this.findRequestById(itemId);
          if (request) {
            request.name = newName;
            // Save the root collection that contains this request
            const rootCollection = this.findRootCollection(request.parentId || request.collectionId || '');
            if (rootCollection) {
              await this.saveCollection(rootCollection);
            } else {
              await this.saveRequest(request);
            }
          }
        }
      }
      this.renderCollections();
    };

    const cancelEdit = () => {
      this.renderCollections();
    };

    // Event listeners
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getCollections(): Collection[] {
    return [...this.collections];
  }

  getSelectedRequest(): Request | null {
    return this.selectedRequest;
  }

  private async loadExpandedFolders(): Promise<void> {
    try {
      const settings = await window.electronAPI.getSettings();
      if (settings.expandedFolders) {
        this.expandedFolders = new Set(settings.expandedFolders);
      }
    } catch (error) {
      console.error('Failed to load expanded folders:', error);
    }
  }

  private async saveExpandedFolders(): Promise<void> {
    try {
      const expandedFolders = Array.from(this.expandedFolders);
      await window.electronAPI.saveSettings({ expandedFolders });
    } catch (error) {
      console.error('Failed to save expanded folders:', error);
    }
  }

  getExpandedFolders(): string[] {
    return Array.from(this.expandedFolders);
  }
}

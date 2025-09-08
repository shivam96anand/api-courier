import { EventBus } from '../utils/event-bus';
import { Collection, Request } from '../../shared/types';
import { Modal } from '../utils/modal';

export class CollectionsManager {
  private collections: Collection[] = [];
  private selectedRequest: Request | null = null;

  constructor(private eventBus: EventBus) {}

  initialize(): void {
    this.setupEventListeners();
    this.setupImportButton();
    this.setupNewCollectionButton();
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

    if (parentId) {
      this.addToParent(folder, parentId);
    } else {
      this.collections.push(folder);
    }

    this.renderCollections();
    await this.saveCollection(folder);
    
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

    if (parentId) {
      this.addRequestToParent(request, parentId);
    } else {
      // Create a default collection if none exists
      if (this.collections.length === 0) {
        await this.createNewCollection();
      }
      if (this.collections.length > 0) {
        this.addRequestToParent(request, this.collections[0].id);
      }
    }

    this.renderCollections();
    await this.saveRequest(request);
    
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

  private attachRequestEventListeners(): void {
    document.querySelectorAll('.request-item').forEach(item => {
      const requestId = item.getAttribute('data-request-id');
      if (requestId) {
        // Single click to select request
        let clickCount = 0;
        item.addEventListener('click', () => {
          const request = this.findRequestById(requestId);
          if (!request) return;
          
          clickCount++;
          if (clickCount === 1) {
            setTimeout(() => {
              if (clickCount === 1) {
                // Single click - select request
                this.eventBus.emit('request:selected', request);
              } else if (clickCount === 2) {
                // Double click - rename request
                this.startInlineEdit(request.id, 'request');
              }
              clickCount = 0;
            }, 300);
          }
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
        if (actionBtn) {
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
      await this.saveRequest(request);
    }
  }

  private async duplicateRequest(request: Request): Promise<void> {
    const newName = await Modal.prompt('Enter name for duplicate:', `${request.name} Copy`);
    if (newName && newName.trim()) {
      const duplicate: Request = {
        ...JSON.parse(JSON.stringify(request)),
        id: this.generateId(),
        name: newName.trim()
      };

      // Add to the same parent
      if (request.parentId) {
        this.addRequestToParent(duplicate, request.parentId);
      } else if (request.collectionId) {
        this.addRequestToParent(duplicate, request.collectionId);
      }

      this.renderCollections();
      await this.saveRequest(duplicate);
    }
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
    
    div.innerHTML = `
      <div class="collection-header" data-id="${collection.id}">
        <span class="collection-toggle" style="margin-right: 4px; cursor: pointer; font-size: 12px; color: var(--text-secondary);">▶</span>
        <span class="collection-icon" style="margin-right: 8px;">${icon}</span>
        <span class="collection-name" style="flex: 1; font-size: 13px;">${collection.name}</span>
        <div class="collection-actions" style="opacity: 0; transition: opacity 0.2s;">
          <button class="action-btn" data-action="menu" data-id="${collection.id}" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 2px; font-size: 12px;">⋯</button>
        </div>
      </div>
      <div class="collection-children" style="display: none;">
        ${this.renderCollectionContent(collection, depth + 1)}
      </div>
    `;

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
        const isExpanded = children.style.display !== 'none';
        children.style.display = isExpanded ? 'none' : 'block';
        toggle.textContent = isExpanded ? '▶' : '▼';
      };

      // Single click on header expands/collapses
      header.addEventListener('click', (e) => {
        // Don't trigger if clicking on action button
        if (e.target === actionBtn || actionBtn.contains(e.target as Node)) {
          return;
        }
        e.stopPropagation();
        toggleChildren();
      });

      // Double click on header renames
      let clickCount = 0;
      header.addEventListener('click', (e) => {
        if (e.target === actionBtn || actionBtn.contains(e.target as Node)) {
          return;
        }
        
        clickCount++;
        if (clickCount === 1) {
          setTimeout(() => {
            if (clickCount === 2) {
              e.stopPropagation();
              this.startInlineEdit(collection.id, 'collection');
            }
            clickCount = 0;
          }, 300);
        }
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

    // Context menu
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showContextMenu(e, collection);
      });
    }

    // Right-click context menu
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, collection);
    });
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

  private renderCollectionContent(collection: Collection, depth: number): string {
    let html = '';

    // Render child collections/folders
    if (collection.children && collection.children.length > 0) {
      collection.children.forEach(child => {
        const childElement = this.createCollectionElement(child, depth);
        html += childElement.outerHTML;
      });
    }

    // Render requests
    if (collection.requests && collection.requests.length > 0) {
      collection.requests.forEach(request => {
        const isSelected = this.selectedRequest?.id === request.id;
        html += `
          <div class="request-item ${isSelected ? 'active' : ''}" 
               data-request-id="${request.id}" 
               style="margin-left: ${depth * 16}px; padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; transition: background-color 0.2s; display: flex; align-items: center;">
            <span class="request-method method-${request.method.toLowerCase()}" 
                  style="display: inline-block; width: 40px; font-weight: 600; font-size: 10px; text-transform: uppercase; margin-right: 8px;">
              ${request.method}
            </span>
            <span class="request-name" style="flex: 1;">${request.name}</span>
            <div class="request-actions" style="opacity: 0; transition: opacity 0.2s;">
              <button class="action-btn" data-action="request-menu" data-id="${request.id}" 
                      style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 2px; border-radius: 2px; font-size: 10px;">⋯</button>
            </div>
          </div>
        `;
      });
    }

    return html;
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
    const newName = await Modal.prompt('Enter name for duplicate:', `${collection.name} Copy`);
    if (newName && newName.trim()) {
      const duplicate: Collection = {
        ...JSON.parse(JSON.stringify(collection)),
        id: this.generateId(),
        name: newName.trim(),
        type: collection.type || 'collection'
      };

      // Generate new IDs for all children and requests
      this.regenerateIds(duplicate);

      this.collections.push(duplicate);
      this.renderCollections();
      await this.saveCollection(duplicate);
    }
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
      item.classList.remove('active');
    });

    // Highlight selected request
    const requestElement = document.querySelector(`[data-request-id="${request.id}"]`);
    if (requestElement) {
      requestElement.classList.add('active');
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
            await this.saveRequest(request);
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
}

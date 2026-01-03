import { Collection } from '../../../shared/types';
import { iconHtml } from '../../utils/icons';

export interface CollectionTreeState {
  expandedFolders: Set<string>;
  searchTerm: string;
  draggedItem?: string;
}

export class CollectionsSearch {
  private onTreeStateChange: (state: CollectionTreeState) => void;
  private onShowKeyboardShortcuts: () => void;
  private savedExpandedFolders: Set<string> = new Set();

  constructor(
    onTreeStateChange: (state: CollectionTreeState) => void,
    onShowKeyboardShortcuts: () => void
  ) {
    this.onTreeStateChange = onTreeStateChange;
    this.onShowKeyboardShortcuts = onShowKeyboardShortcuts;
  }

  setupSearchFunctionality(getCurrentExpandedFolders: () => Set<string>): void {
    // Note: Import button is now defined in HTML, not created dynamically

    const collectionsTree = document.getElementById('collections-tree');
    if (!collectionsTree) return;

    // Get the toolbar and its buttons
    const toolbar = document.querySelector('.collections-toolbar');
    const importBtn = document.getElementById('btn-import');
    const addBtn = document.getElementById('add-collection');

    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
      <div class="search-input-wrapper">
        <input type="text" id="collections-search" class="search-input" placeholder="Search collections">
        ${iconHtml('search', 'search-icon')}
      </div>
      <div class="search-actions"></div>
    `;

    collectionsTree.parentNode?.insertBefore(searchContainer, collectionsTree);

    // Move the toolbar buttons into the search container
    const searchActions = searchContainer.querySelector('.search-actions');
    if (searchActions && importBtn && addBtn) {
      const exportBtn = document.createElement('button');
      exportBtn.id = 'btn-export-collections';
      exportBtn.className = 'btn-export';
      exportBtn.title = 'Export Collections';
      exportBtn.innerHTML = iconHtml('export', 'ui-icon');

      searchActions.appendChild(importBtn);
      searchActions.appendChild(exportBtn);
      searchActions.appendChild(addBtn);
    }

    // Hide the now-empty toolbar
    if (toolbar) {
      (toolbar as HTMLElement).style.display = 'none';
    }

    const searchInput = document.getElementById('collections-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.handleSearchInput(target.value.toLowerCase(), getCurrentExpandedFolders());
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.handleSearchInput('', getCurrentExpandedFolders());
        }
      });
    }
  }

  private handleSearchInput(searchTerm: string, currentExpandedFolders?: Set<string>): void {
    if (searchTerm && currentExpandedFolders) {
      // Save the user's folder state when starting a search
      this.savedExpandedFolders = new Set(currentExpandedFolders);
    }

    this.onTreeStateChange({
      expandedFolders: searchTerm ? new Set() : this.savedExpandedFolders,
      searchTerm,
      draggedItem: undefined
    });
  }

  getFilteredCollections(collections: Collection[], searchTerm: string): Collection[] {
    if (!searchTerm) return collections;

    const matchingCollections = collections.filter(collection =>
      collection.name.toLowerCase().includes(searchTerm)
    );

    const result = new Set(matchingCollections);
    matchingCollections.forEach(collection => {
      let parent = this.findCollectionById(collections, collection.parentId || '');
      while (parent) {
        result.add(parent);
        parent = this.findCollectionById(collections, parent.parentId || '');
      }
    });

    return Array.from(result);
  }

  getVisibleCollections(
    collections: Collection[],
    expandedFolders: Set<string>
  ): Collection[] {
    const getCollectionsInOrder = (parentId?: string): Collection[] => {
      const items: Collection[] = [];
      const children = collections
        .filter(c => c.parentId === parentId)
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      for (const child of children) {
        items.push(child);
        if (child.type === 'folder' && expandedFolders.has(child.id)) {
          items.push(...getCollectionsInOrder(child.id));
        }
      }

      return items;
    };

    return getCollectionsInOrder();
  }

  handleArrowNavigation(
    e: KeyboardEvent,
    collections: Collection[],
    expandedFolders: Set<string>,
    selectedCollectionId: string | undefined,
    onSelectCollection: (id: string) => void,
    onToggleFolder: (id: string) => void
  ): void {
    const visibleCollections = this.getVisibleCollections(collections, expandedFolders);
    const currentIndex = visibleCollections.findIndex(c => c.id === selectedCollectionId);

    if (currentIndex === -1 && visibleCollections.length > 0) {
      onSelectCollection(visibleCollections[0].id);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        if (currentIndex > 0) {
          onSelectCollection(visibleCollections[currentIndex - 1].id);
          e.preventDefault();
        }
        break;

      case 'ArrowDown':
        if (currentIndex < visibleCollections.length - 1) {
          onSelectCollection(visibleCollections[currentIndex + 1].id);
          e.preventDefault();
        }
        break;

      case 'ArrowRight':
        const current = visibleCollections[currentIndex];
        if (current && current.type === 'folder' && !expandedFolders.has(current.id)) {
          onToggleFolder(current.id);
          e.preventDefault();
        }
        break;

      case 'ArrowLeft':
        const currentFolder = visibleCollections[currentIndex];
        if (currentFolder && currentFolder.type === 'folder' && expandedFolders.has(currentFolder.id)) {
          onToggleFolder(currentFolder.id);
          e.preventDefault();
        }
        break;
    }
  }

  private findCollectionById(collections: Collection[], id: string): Collection | undefined {
    return collections.find(c => c.id === id);
  }
}

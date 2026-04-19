import { Collection } from '../../../shared/types';
import { CollectionTreeState } from './collections-search';
import { createIconElement, getMethodIcon, getIcon } from './collections-icons';
import { iconHtml, IconName } from '../../utils/icons';

export class CollectionsRenderer {
  private findCollectionById: (id: string) => Collection | undefined;

  constructor(findCollectionById: (id: string) => Collection | undefined) {
    this.findCollectionById = findCollectionById;
  }

  renderCollections(
    collections: Collection[],
    treeState: CollectionTreeState,
    selectedCollectionId: string | undefined,
    activeRequestId: string | undefined,
    filteredCollections?: Collection[]
  ): void {
    const tree = document.getElementById('collections-tree');
    if (!tree) return;

    const collectionsToShow = filteredCollections || collections;

    const rootCollections = collectionsToShow
      .filter((c) => !c.parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (rootCollections.length === 0) {
      if (treeState.searchTerm) {
        tree.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${iconHtml('search')}</div>
            <div class="empty-state-message">No collections match your search.</div>
          </div>
        `;
      } else {
        const emptyStateContainer = document.createElement('div');
        emptyStateContainer.className = 'empty-state';

        const icon = document.createElement('div');
        icon.className = 'empty-state-icon';
        const folderIcon = createIconElement('folder-closed', {
          style: { width: '48px', height: '48px', opacity: '0.3' },
        });
        icon.appendChild(folderIcon);

        const message = document.createElement('div');
        message.className = 'empty-state-message';
        message.textContent =
          'No collections yet. Get started by creating your first folder or request.';

        const ctaButton = document.createElement('button');
        ctaButton.className = 'empty-state-cta';
        ctaButton.id = 'empty-state-create-btn';
        const addIcon = createIconElement('add', {
          style: { width: '16px', height: '16px' },
        });
        ctaButton.appendChild(addIcon);
        const buttonText = document.createTextNode('Create Collection');
        ctaButton.appendChild(buttonText);

        emptyStateContainer.appendChild(icon);
        emptyStateContainer.appendChild(message);
        emptyStateContainer.appendChild(ctaButton);

        tree.innerHTML = '';
        tree.appendChild(emptyStateContainer);
      }
      return;
    }

    tree.innerHTML = '';
    rootCollections.forEach((collection) => {
      const element = this.createCollectionElement(
        collection,
        0,
        collections,
        treeState,
        selectedCollectionId,
        activeRequestId,
        filteredCollections
      );
      tree.appendChild(element);
    });
  }

  createCollectionElement(
    collection: Collection,
    depth: number,
    allCollections: Collection[],
    treeState: CollectionTreeState,
    selectedCollectionId: string | undefined,
    activeRequestId: string | undefined,
    filteredCollections?: Collection[]
  ): HTMLElement {
    const element = document.createElement('div');
    element.className = 'collection-item';
    element.dataset.collectionId = collection.id;
    element.draggable = true;

    const baseIndent = 4;
    const indentPerLevel = 20;
    element.style.paddingLeft = depth * indentPerLevel + baseIndent + 'px';

    if (collection.id === selectedCollectionId) {
      element.classList.add('selected');
    }

    if (collection.type === 'folder') {
      element.classList.add('folder');
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'collection-content';

    if (collection.type === 'folder') {
      const isExpanded = treeState.expandedFolders.has(collection.id);
      const toggle = createIconElement(
        isExpanded ? 'chevron-down' : 'chevron-right',
        {
          className: 'folder-toggle',
          title: isExpanded ? 'Collapse folder' : 'Expand folder',
        }
      );
      toggle.dataset.folderId = collection.id;
      contentWrapper.appendChild(toggle);
    } else {
      if (depth > 0) {
        const spacer = document.createElement('span');
        spacer.className = 'folder-spacer';
        contentWrapper.appendChild(spacer);
      }
    }

    // Add icon (only for folders, not for requests)
    if (collection.type === 'folder') {
      const isExpanded = treeState.expandedFolders.has(collection.id);
      const icon = createIconElement(
        isExpanded ? 'folder-open' : 'folder-closed',
        { className: 'collection-icon' }
      );
      contentWrapper.appendChild(icon);
    }

    // Add method badge for requests (no icon, just badge)
    if (collection.type === 'request' && collection.request) {
      const methodBadge = document.createElement('span');
      methodBadge.className = 'method-badge'; // Remove method-specific class
      methodBadge.textContent = collection.request.method;
      methodBadge.title = `${collection.request.method} request`;
      contentWrapper.appendChild(methodBadge);

      if (collection.request.id === activeRequestId) {
        const activeIndicator = document.createElement('span');
        activeIndicator.className = 'active-request-indicator';
        activeIndicator.title = 'Active request';
        contentWrapper.appendChild(activeIndicator);
      }
    }

    const name = document.createElement('span');
    name.className = 'collection-name';
    name.textContent = collection.name;
    name.title = collection.name; // Add tooltip for full name

    if (
      treeState.searchTerm &&
      collection.name.toLowerCase().includes(treeState.searchTerm)
    ) {
      name.classList.add('search-highlight');
    }

    contentWrapper.appendChild(name);

    // Add folder count badge or empty indicator for folders
    if (collection.type === 'folder') {
      const childCount = allCollections.filter(
        (c) => c.parentId === collection.id
      ).length;

      if (childCount === 0) {
        const emptyIndicator = document.createElement('span');
        emptyIndicator.className = 'empty-folder-indicator';
        emptyIndicator.textContent = '(empty)';
        contentWrapper.appendChild(emptyIndicator);
      } else {
        const countBadge = document.createElement('span');
        countBadge.className = 'folder-count-badge';
        countBadge.textContent = childCount.toString();
        countBadge.title = `${childCount} item${childCount !== 1 ? 's' : ''}`;
        contentWrapper.appendChild(countBadge);

        // Hover-revealed "Run folder" button. Dispatches a custom event the
        // collections-manager listens for; keeps this renderer free of any
        // request-execution logic.
        const runBtn = document.createElement('button');
        runBtn.className = 'folder-run-btn';
        runBtn.title = 'Run all requests in this folder';
        runBtn.setAttribute('aria-label', `Run folder ${collection.name}`);
        runBtn.innerHTML = '\u25B6';
        runBtn.dataset.folderId = collection.id;
        runBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          document.dispatchEvent(
            new CustomEvent('folder-run-requested', {
              detail: { folderId: collection.id },
            })
          );
        });
        contentWrapper.appendChild(runBtn);
      }
    }

    element.appendChild(contentWrapper);

    const container = document.createElement('div');
    container.className = 'collection-container';
    container.appendChild(element);

    if (collection.type === 'folder') {
      const isExpanded = treeState.expandedFolders.has(collection.id);
      const isSearching = treeState.searchTerm.length > 0;

      if (isExpanded || isSearching) {
        const children = allCollections
          .filter((c) => c.parentId === collection.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        let childrenToShow = children;
        if (isSearching && filteredCollections) {
          childrenToShow = children.filter((child) =>
            filteredCollections.some((fc) => fc.id === child.id)
          );
        }

        if (childrenToShow.length > 0) {
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'collection-children';

          childrenToShow.forEach((child) => {
            const childElement = this.createCollectionElement(
              child,
              depth + 1,
              allCollections,
              treeState,
              selectedCollectionId,
              activeRequestId,
              filteredCollections
            );
            childrenContainer.appendChild(childElement);
          });

          container.appendChild(childrenContainer);
        }
      }
    }

    return container;
  }

  showCreateMenu(
    event: MouseEvent,
    onCreateFolder: () => void,
    onCreateRequest: () => void
  ): void {
    const button = event.target as HTMLElement;
    const rect = button.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'create-menu';
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.zIndex = '10000';

    const createOptions = [
      {
        label: 'New Folder',
        icon: 'folder-closed' as const,
        action: onCreateFolder,
        description: 'Create a new folder',
      },
      {
        label: 'New Request',
        icon: 'file' as const,
        action: onCreateRequest,
        description: 'Create a new API request',
      },
    ];

    createOptions.forEach((option) => {
      const item = document.createElement('div');
      item.className = 'create-menu-item';

      const icon = createIconElement(option.icon, {
        style: {
          width: '14px',
          height: '14px',
          display: 'inline-block',
          flexShrink: '0',
        },
      });
      item.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = option.label;
      label.style.fontWeight = '500';

      item.appendChild(label);
      item.title = option.description;

      item.addEventListener('click', () => {
        option.action();
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
      });

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

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

  showContextMenu(
    event: MouseEvent,
    collection: Collection,
    actions: Array<{
      label: string;
      action: (() => void) | null;
      destructive?: boolean;
      icon?: IconName;
    }>
  ): void {
    // Remove any existing context menus
    const existingMenus = document.querySelectorAll('.context-menu');
    existingMenus.forEach((menu) => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';
    menu.style.visibility = 'hidden'; // Hide initially to measure dimensions

    actions.forEach((action) => {
      const item = document.createElement('div');

      if (action.label === '---') {
        item.className = 'context-menu-separator';
      } else {
        item.className = 'context-menu-item';
        if (action.destructive) {
          item.classList.add('destructive');
        }

        if (action.icon) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'context-menu-icon';
          iconSpan.innerHTML = iconHtml(action.icon);
          item.appendChild(iconSpan);
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'context-menu-label';
        labelSpan.textContent = action.label;
        item.appendChild(labelSpan);

        if (action.action) {
          item.addEventListener('click', () => {
            action.action!();
            if (document.body.contains(menu)) {
              document.body.removeChild(menu);
            }
          });
        }
      }

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Position menu with boundary detection
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY;

    // Check right boundary
    if (left + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 8; // 8px padding
    }

    // Check bottom boundary
    if (top + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 8; // 8px padding
    }

    // Ensure menu doesn't go off the left or top edge
    left = Math.max(8, left);
    top = Math.max(8, top);

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';

    const handleClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
      }
    };

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('click', handleClickOutside);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);
  }
}

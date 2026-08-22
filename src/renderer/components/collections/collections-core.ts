import { Collection, ApiRequest } from '../../../shared/types';
import { cloneApiRequest } from '../../../shared/clone-request';
import { CollectionsSearch, CollectionTreeState } from './collections-search';
import { CollectionsUIHandler } from './collections-ui-handler';
import { CollectionsRenderer } from './collections-renderer';
import { CollectionsOperations } from './collections-operations';
import { CollectionsStatePersistence } from './collections-state-persistence';
import { FolderVariablesDialog } from './folder-variables-dialog';
import { buildFolderVars } from '../request/variable-helper';
import { collectionRunner } from './collection-runner';

export class CollectionsCore {
  private collections: Collection[] = [];
  private selectedCollectionId?: string;
  private activeRequestId?: string;
  private treeState: CollectionTreeState = {
    expandedFolders: new Set(),
    searchTerm: '',
    draggedItem: undefined,
    hiddenCollections: new Set(),
  };

  private search: CollectionsSearch;
  private uiHandler: CollectionsUIHandler;
  private renderer: CollectionsRenderer;
  private operations: CollectionsOperations;
  private statePersistence: CollectionsStatePersistence;

  /** Whether the user's last click/focus landed inside the collections panel. */
  private collectionsPanelActive = false;

  constructor() {
    this.statePersistence = new CollectionsStatePersistence();

    this.operations = new CollectionsOperations((message) =>
      this.uiHandler.showError(message)
    );

    this.search = new CollectionsSearch(
      (state) => this.updateTreeState(state),
      () => this.uiHandler.showKeyboardShortcuts()
    );

    this.uiHandler = new CollectionsUIHandler(
      (folderId) => this.toggleFolder(folderId),
      (collectionId) => this.selectCollection(collectionId),
      (event) => this.showCreateMenu(event),
      (event, collectionId) => this.showContextMenu(event, collectionId),
      (draggedId, targetFolderId) =>
        this.handleMoveCollection(draggedId, targetFolderId),
      (draggedId, targetId, position) =>
        this.handleReorderCollection(draggedId, targetId, position),
      (id) => this.operations.findCollectionById(id)
    );

    this.renderer = new CollectionsRenderer((id) =>
      this.operations.findCollectionById(id)
    );
    this.renderer.setHiddenHandlers(
      (id) => this.setCollectionHidden(id, false),
      () => this.unhideAllCollections()
    );
  }

  initialize(): void {
    this.uiHandler.setupCollectionEvents(this.treeState);
    this.search.setupSearchFunctionality(() => this.treeState.expandedFolders);
    this.setupExportButton();
    this.setupPanelActivityTracking();
    this.setupKeyboardShortcuts();
    this.setupInlineRenameListener();
    this.renderCollections();
  }

  /**
   * Remembers whether the collections panel is the region the user is working
   * in, so Cmd/Ctrl+F can target the collections search instead of the
   * response body search.
   */
  private setupPanelActivityTracking(): void {
    const inPanel = (event: Event): boolean => {
      const target = event.target;
      return (
        target instanceof Element && !!target.closest('.collections-panel')
      );
    };

    // A click is the explicit signal for "this is the region I'm working in".
    document.addEventListener(
      'pointerdown',
      (event) => {
        this.collectionsPanelActive = inPanel(event);
      },
      true
    );

    // Focus can only switch tracking on: editors elsewhere grab focus
    // programmatically after a request loads, which must not reset the region.
    document.addEventListener(
      'focusin',
      (event) => {
        if (inPanel(event)) this.collectionsPanelActive = true;
      },
      true
    );
  }

  private updateTreeState(newState: Partial<CollectionTreeState>): void {
    this.treeState = { ...this.treeState, ...newState };
    this.renderCollections();
  }

  private toggleFolder(folderId: string): void {
    if (this.treeState.expandedFolders.has(folderId)) {
      this.treeState.expandedFolders.delete(folderId);
    } else {
      this.treeState.expandedFolders.add(folderId);
    }

    // Persist the expanded folders state
    this.statePersistence.saveExpandedFolders(this.treeState.expandedFolders);

    this.renderCollections();
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      const apiTab = document.getElementById('api-tab');
      if (!apiTab?.classList.contains('active')) {
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        this.showCreateDialog('folder');
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        this.showCreateDialog('request');
      }

      if (e.key === 'Delete' && this.selectedCollectionId) {
        e.preventDefault();
        this.operations
          .deleteCollection(this.selectedCollectionId)
          .then(() => this.renderCollections());
      }

      if (e.key === 'F2' && this.selectedCollectionId) {
        e.preventDefault();
        this.operations
          .renameCollection(this.selectedCollectionId)
          .then(() => this.renderCollections());
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'd' &&
        this.selectedCollectionId
      ) {
        e.preventDefault();
        this.operations
          .duplicateCollection(this.selectedCollectionId)
          .then(() => this.renderCollections());
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'e' &&
        this.selectedCollectionId
      ) {
        e.preventDefault();
        this.operations.exportCollection(this.selectedCollectionId);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.handleFindShortcut();
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.search.handleArrowNavigation(
          e,
          this.collections,
          this.treeState.expandedFolders,
          this.selectedCollectionId,
          (id) => this.selectCollection(id),
          (id) => this.toggleFolder(id)
        );
      }
    });
  }

  /**
   * Cmd/Ctrl+F belongs to the collections search whenever the collections
   * panel is the region the user is working in; otherwise it opens the
   * response body search (when a response is on screen).
   */
  private handleFindShortcut(): void {
    const hasResponse = document.querySelector(
      '#response-body #response-monaco-json-container, #response-body #response-monaco-xml-container, #response-body pre'
    );

    if (!this.collectionsPanelActive && hasResponse) {
      document.dispatchEvent(new CustomEvent('trigger-response-search'));
      return;
    }

    const searchInput = document.getElementById(
      'collections-search'
    ) as HTMLInputElement | null;
    searchInput?.focus();
    searchInput?.select();
  }

  /**
   * Listen for the custom event that triggers inline rename on a collection
   * item in the sidebar tree. Finds the `.collection-name` span and replaces
   * it with an input. Commits on Enter/blur, cancels on Escape.
   */
  private setupInlineRenameListener(): void {
    document.addEventListener('collection-start-inline-rename', ((
      e: CustomEvent
    ) => {
      const collectionId = e.detail?.collectionId as string | undefined;
      if (!collectionId) return;
      this.startInlineRename(collectionId);
    }) as EventListener);
  }

  private startInlineRename(collectionId: string): void {
    const collection = this.operations.findCollectionById(collectionId);
    if (!collection) return;

    const el = document.querySelector(
      `.collection-item[data-collection-id="${CSS.escape(collectionId)}"]`
    );
    if (!el) return;

    const nameSpan = el.querySelector('.collection-name') as HTMLElement | null;
    if (!nameSpan) return;

    // Prevent double-activation
    if (nameSpan.querySelector('input')) return;

    const original = collection.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'collection-rename-input';
    input.setAttribute('aria-label', 'Rename collection');

    nameSpan.textContent = '';
    nameSpan.appendChild(input);
    input.focus();
    input.select();

    const commit = (next: string): void => {
      const trimmed = next.trim();
      if (trimmed && trimmed !== original) {
        nameSpan.textContent = trimmed;
        void this.operations.commitRename(collectionId, trimmed);
      } else {
        nameSpan.textContent = original;
      }
    };

    let committed = false;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        committed = true;
        commit(input.value);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        committed = true;
        nameSpan.textContent = original;
      }
    });
    input.addEventListener('blur', () => {
      if (!committed) commit(input.value);
    });
    // Stop click from bubbling so the collection-item click handler
    // doesn't also fire (which would re-select and re-render).
    input.addEventListener('click', (ev) => ev.stopPropagation());
  }

  private showCreateMenu(event: MouseEvent): void {
    this.renderer.showCreateMenu(
      event,
      () => this.showCreateDialog('folder'),
      () => this.showCreateDialog('request')
    );
  }

  private async showCreateDialog(
    type: 'folder' | 'request' = 'folder',
    parentId?: string
  ): Promise<void> {
    const newCollection = await this.operations.showCreateDialog(
      type,
      parentId
    );
    if (newCollection) {
      this.renderCollections();
      this.selectCollection(newCollection.id);
    }
  }

  private showContextMenu(event: MouseEvent, collectionId: string): void {
    const collection = this.operations.findCollectionById(collectionId);
    if (!collection) return;

    const actions = [];

    if (collection.type === 'folder') {
      actions.push(
        {
          label: 'Add Folder',
          icon: 'folder',
          action: () => this.showCreateDialog('folder', collectionId),
        },
        {
          label: 'Add Request',
          icon: 'file',
          action: () => this.showCreateDialog('request', collectionId),
        },
        { label: '---', action: null },
        {
          label: 'Manage Variables',
          icon: 'settings',
          action: () => this.showFolderVariablesDialog(collectionId),
        },
        { label: '---', action: null },
        {
          label: 'Duplicate Folder',
          icon: 'duplicate',
          action: () =>
            this.operations
              .duplicateCollection(collectionId)
              .then(() => this.renderCollections()),
        },
        {
          label: 'Export Folder',
          icon: 'export',
          action: () => this.operations.exportCollection(collectionId),
        },
        {
          label: 'Run All Requests',
          icon: 'layers',
          action: () => collectionRunner.run(collectionId, collection.name),
        },
        { label: '---', action: null }
      );
    } else {
      actions.push(
        {
          label: 'Duplicate Request',
          icon: 'duplicate',
          action: () =>
            this.operations
              .duplicateCollection(collectionId)
              .then(() => this.renderCollections()),
        },
        {
          label: 'Export Request',
          icon: 'export',
          action: () => this.operations.exportCollection(collectionId),
        },
        { label: '---', action: null }
      );
    }

    actions.push(
      {
        label: 'Rename',
        icon: 'edit',
        action: () =>
          this.operations
            .renameCollection(collectionId)
            .then(() => this.renderCollections()),
      },
      {
        label: collection.type === 'folder' ? 'Hide Folder' : 'Hide Request',
        icon: 'eye-off',
        action: () => this.setCollectionHidden(collectionId, true),
      },
      {
        label: 'Delete',
        icon: 'trash',
        action: () =>
          this.operations
            .deleteCollection(collectionId)
            .then(() => this.renderCollections()),
        destructive: true,
      }
    );

    this.renderer.showContextMenu(event, collection, actions);
  }

  private setupExportButton(): void {
    const exportBtn = document.getElementById('btn-export-collections');
    if (!exportBtn) return;
    exportBtn.addEventListener('click', () => {
      this.operations.showExportDialog();
    });
  }

  private async showFolderVariablesDialog(collectionId: string): Promise<void> {
    const folder = this.operations.findCollectionById(collectionId);
    if (!folder || folder.type !== 'folder') return;

    // Get inherited variables from parent folders (excluding current folder's variables)
    const inheritedVars = folder.parentId
      ? buildFolderVars(folder.parentId, this.collections)
      : {};

    const result = await FolderVariablesDialog.show(folder, inheritedVars);

    if (result) {
      try {
        // Update the folder with new variables
        await window.restbro.collection.update(collectionId, {
          variables: result.variables,
        });
        folder.variables = result.variables;
        folder.updatedAt = new Date();

        // Dispatch event to notify about the change
        const event = new CustomEvent('collections-changed', {
          detail: { collections: this.collections },
        });
        document.dispatchEvent(event);

        // Also dispatch event to refresh variable tooltips in any open requests
        const refreshEvent = new CustomEvent('folder-variables-changed', {
          detail: { folderId: collectionId, variables: result.variables },
        });
        document.dispatchEvent(refreshEvent);

        this.renderCollections();
      } catch (error) {
        console.error('Failed to update folder variables:', error);
      }
    }
  }

  private selectCollection(collectionId: string): void {
    this.selectedCollectionId = collectionId;
    const collection = this.operations.findCollectionById(collectionId);
    if (collection?.type === 'request' && collection.request) {
      this.activeRequestId = collection.request.id;
    }
    this.renderCollections();

    if (collection && collection.type === 'request' && collection.request) {
      const event = new CustomEvent('open-request-in-tab', {
        detail: {
          request: collection.request,
          // Use parentId for request-type collections so folder variable resolution can walk the parent chain
          collectionId: collection.parentId || collection.id,
        },
      });
      document.dispatchEvent(event);
    }
  }

  private renderCollections(): void {
    const filteredCollections = this.treeState.searchTerm
      ? this.search.getFilteredCollections(
          this.collections,
          this.treeState.searchTerm
        )
      : undefined;

    this.renderer.renderCollections(
      this.collections,
      this.treeState,
      this.selectedCollectionId,
      this.activeRequestId,
      filteredCollections
    );
  }

  private async handleMoveCollection(
    draggedId: string,
    targetFolderId: string
  ): Promise<void> {
    await this.operations.moveCollection(draggedId, targetFolderId);
    this.renderCollections();
  }

  private async handleReorderCollection(
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ): Promise<void> {
    await this.operations.reorderCollection(draggedId, targetId, position);
    this.renderCollections();
  }

  async setCollections(collections: Collection[]): Promise<void> {
    this.collections = collections;
    this.operations.setCollections(collections);

    // Load persisted expanded folders state
    const expandedFolders = await this.statePersistence.loadExpandedFolders();
    this.treeState.expandedFolders = expandedFolders;

    const hidden = await this.statePersistence.loadHiddenCollections();
    // Drop ids of collections that no longer exist so the tray can't strand.
    const existing = new Set(this.collections.map((c) => c.id));
    this.treeState.hiddenCollections = new Set(
      Array.from(hidden).filter((id) => existing.has(id))
    );

    this.renderCollections();
  }

  /** Hide or restore a collection; hidden items live in the bottom tray. */
  private setCollectionHidden(collectionId: string, hidden: boolean): void {
    if (hidden) {
      this.treeState.hiddenCollections.add(collectionId);
    } else {
      this.treeState.hiddenCollections.delete(collectionId);
    }
    this.statePersistence.saveHiddenCollections(
      this.treeState.hiddenCollections
    );
    this.renderCollections();
  }

  private unhideAllCollections(): void {
    this.treeState.hiddenCollections.clear();
    this.statePersistence.saveHiddenCollections(
      this.treeState.hiddenCollections
    );
    this.renderCollections();
  }

  getCollections(): Collection[] {
    return this.collections;
  }

  getSelectedCollection(): Collection | undefined {
    return this.operations.findCollectionById(this.selectedCollectionId || '');
  }

  updateCollectionRequest(
    collectionId: string,
    updatedRequest: ApiRequest
  ): void {
    // The collectionId passed might be a folder ID, so we need to find the actual request collection
    // by searching for the request by its ID
    const requestCollection = this.findRequestCollectionByRequestId(
      this.collections,
      updatedRequest.id
    );

    if (
      requestCollection &&
      requestCollection.type === 'request' &&
      requestCollection.request
    ) {
      // The sidebar shows an HTTP-method badge for request-type collections.
      // Track whether the verb changed so we can refresh the tree to reflect
      // it live (persistence alone wouldn't update the already-rendered badge).
      const methodChanged =
        requestCollection.request.method !== updatedRequest.method;

      // Deep-clone the merged result so the persisted collection tree never
      // shares nested references (params/headers/body/auth) with the live
      // request editor. Without this, later edits — or another request's
      // edits — bleed into the stored request ("two requests merged" bug).
      requestCollection.request = cloneApiRequest({
        ...requestCollection.request,
        ...updatedRequest,
      });
      requestCollection.updatedAt = new Date();

      const event = new CustomEvent('collections-changed', {
        detail: { collections: this.collections },
      });
      document.dispatchEvent(event);

      // Re-render only when a sidebar-visible property (the method badge)
      // changed — avoids rebuilding the tree on every URL/header/body keystroke.
      if (methodChanged) {
        this.renderCollections();
      }
    }
  }

  private findRequestCollectionByRequestId(
    collections: Collection[],
    requestId: string
  ): Collection | null {
    for (const collection of collections) {
      if (
        collection.type === 'request' &&
        collection.request?.id === requestId
      ) {
        return collection;
      }
      if (collection.children) {
        const found = this.findRequestCollectionByRequestId(
          collection.children,
          requestId
        );
        if (found) return found;
      }
    }
    return null;
  }

  setSelectedCollection(collectionId: string): void {
    if (this.selectedCollectionId !== collectionId) {
      this.selectedCollectionId = collectionId;
      this.renderCollections();
    }
  }

  setActiveRequest(requestId?: string): void {
    if (this.activeRequestId !== requestId) {
      this.activeRequestId = requestId;
      this.renderCollections();
    }
  }

  clearSelection(): void {
    if (this.selectedCollectionId) {
      this.selectedCollectionId = undefined;
      this.renderCollections();
    }
  }
}

import { Collection, ApiRequest } from '../../../shared/types';
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
  };

  private search: CollectionsSearch;
  private uiHandler: CollectionsUIHandler;
  private renderer: CollectionsRenderer;
  private operations: CollectionsOperations;
  private statePersistence: CollectionsStatePersistence;

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
  }

  initialize(): void {
    this.uiHandler.setupCollectionEvents(this.treeState);
    this.search.setupSearchFunctionality(() => this.treeState.expandedFolders);
    this.setupExportButton();
    this.setupKeyboardShortcuts();
    this.renderCollections();
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

        // Check if we're on the API tab with a response visible
        const apiTab = document.getElementById('api-tab');
        const isApiTabActive = apiTab?.classList.contains('active');
        const hasResponse =
          document.querySelector(
            '#response-body #response-monaco-json-container'
          ) || document.querySelector('#response-body pre');

        if (isApiTabActive && hasResponse) {
          // Trigger Monaco search in the response viewer
          const searchEvent = new CustomEvent('trigger-response-search');
          document.dispatchEvent(searchEvent);
        } else {
          // Focus collections search
          const searchInput = document.getElementById(
            'collections-search'
          ) as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }
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
      requestCollection.request = {
        ...requestCollection.request,
        ...updatedRequest,
      };
      requestCollection.updatedAt = new Date();

      const event = new CustomEvent('collections-changed', {
        detail: { collections: this.collections },
      });
      document.dispatchEvent(event);
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

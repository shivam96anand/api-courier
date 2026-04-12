import { ApiRequest, Collection, Environment, Globals, SoapCerts } from '../../../shared/types';
import { CollectionsDialogs } from './collections-dialogs';
import { showExportDialog } from './export-dialog';

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

      // Calculate order to place duplicate right after the original
      const siblings = this.collections
        .filter(c => c.parentId === collection.parentId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const originalIndex = siblings.findIndex(c => c.id === collectionId);
      const newOrder = originalIndex !== -1 && originalIndex < siblings.length - 1
        ? ((collection.order ?? 0) + (siblings[originalIndex + 1].order ?? 0)) / 2
        : (collection.order ?? 0) + 1000;

      const newCollection = await window.apiCourier.collection.create({
        name: duplicatedName,
        type: collection.type,
        parentId: collection.parentId,
        order: newOrder,
        request: collection.request ? { ...collection.request } : undefined
      });

      // Insert the duplicate right after the original in the array
      const insertIndex = this.collections.findIndex(c => c.id === collectionId);
      if (insertIndex !== -1) {
        this.collections.splice(insertIndex + 1, 0, newCollection);
      } else {
        this.collections.push(newCollection);
      }

      if (collection.type === 'folder') {
        await this.duplicateChildren(collection.id, newCollection.id);
      }

      // Dispatch collections changed event
      const event = new CustomEvent('collections-changed', {
        detail: { collections: this.collections }
      });
      document.dispatchEvent(event);
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

    const exportData = this.buildApiCourierExportPayload(
      [this.buildExportData(collection)],
      [],
      undefined
    );

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

  /**
   * Shows export dialog and downloads a single JSON file with selected collections,
   * environments, and optionally globals (restbro-export format).
   */
  async showExportDialog(): Promise<void> {
    const state = await window.apiCourier.store.get();
    const collections = state.collections ?? [];
    const environments = (state.environments ?? []) as Environment[];
    const globals = state.globals as Globals | undefined;

    const selection = await showExportDialog({
      collections,
      environments,
      globals,
    });

    if (!selection) return;

    const rootCollections = selection.collectionIds
      .map((id) => this.findCollectionById(id))
      .filter((c): c is Collection => c != null);

    const collectionTrees = rootCollections.map((c) => this.buildExportData(c));
    const selectedEnvs = environments.filter((e) => selection.environmentIds.includes(e.id));
    const exportData = this.buildApiCourierExportPayload(
      collectionTrees,
      selectedEnvs,
      selection.includeGlobals ? globals : undefined
    );

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restbro-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private buildApiCourierExportPayload(
    collectionTrees: any[],
    environments: Environment[],
    globals?: Globals
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      version: '1.0',
      type: 'api-courier-export',
      timestamp: new Date().toISOString(),
      collections: collectionTrees,
      environments,
    };
    if (globals?.variables && Object.keys(globals.variables).length > 0) {
      payload.globals = globals;
    }
    return payload;
  }

  async exportAllCollections(): Promise<void> {
    const state = await window.apiCourier.store.get();
    const rootItems = this.buildPostmanItems();

    const collectionExport = {
      info: {
        name: 'Restbro Export',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: rootItems
    };

    this.downloadJson('restbro-collection', collectionExport);

    const environments = Array.isArray(state.environments) ? state.environments : [];
    environments.forEach((env) => {
      const values = Object.entries(env.variables || {}).map(([key, value]) => ({
        key,
        value,
        enabled: true
      }));
      if (values.length === 0) return;
      const envExport = {
        id: env.id,
        name: env.name || 'Environment',
        values,
        _postman_variable_scope: 'environment'
      };
      this.downloadJson(`restbro-env-${env.name || env.id}`, envExport);
    });

    const globals = state.globals?.variables || {};
    const globalValues = Object.entries(globals).map(([key, value]) => ({
      key,
      value,
      enabled: true
    }));
    if (globalValues.length > 0) {
      const globalsExport = {
        id: 'restbro-globals',
        name: 'Globals',
        values: globalValues,
        _postman_variable_scope: 'globals'
      };
      this.downloadJson('restbro-globals', globalsExport);
    }
  }

  private sanitizeRequestForExport(request: ApiRequest | undefined): ApiRequest | undefined {
    if (!request) return undefined;
    if (!request.soapCerts) return request;

    // Strip sensitive fields: passwords and cert/key binary content.
    // Keep mode, source type, and file path hints so users know what to re-upload.
    const sc = request.soapCerts;
    const sanitizedCerts: SoapCerts = { mode: sc.mode };

    if (sc.keystoreSource) sanitizedCerts.keystoreSource = sc.keystoreSource;
    if (sc.keystoreFilePath) sanitizedCerts.keystoreFilePath = sc.keystoreFilePath;
    if (sc.truststoreSource) sanitizedCerts.truststoreSource = sc.truststoreSource;
    if (sc.truststoreFilePath) sanitizedCerts.truststoreFilePath = sc.truststoreFilePath;

    // PEM mode: keep source type and file path hints only
    if (sc.clientCert?.filePath) sanitizedCerts.clientCert = { source: sc.clientCert.source, content: '', filePath: sc.clientCert.filePath };
    if (sc.clientKey?.filePath)  sanitizedCerts.clientKey  = { source: sc.clientKey.source,  content: '', filePath: sc.clientKey.filePath };
    if (sc.caCert?.filePath)     sanitizedCerts.caCert     = { source: sc.caCert.source,     content: '', filePath: sc.caCert.filePath };
    if (sc.pfx?.filePath)        sanitizedCerts.pfx        = { source: sc.pfx.source,        content: '', filePath: sc.pfx.filePath };

    return { ...request, soapCerts: sanitizedCerts };
  }

  private buildExportData(collection: Collection): any {
    const data: any = {
      id: collection.id,
      name: collection.name,
      type: collection.type,
      request: this.sanitizeRequestForExport(collection.request),
      variables: collection.variables,
      children: []
    };

    if (collection.type === 'folder') {
      const children = this.collections
        .filter(c => c.parentId === collection.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      data.children = children.map(child => this.buildExportData(child));
    }

    return data;
  }

  private buildPostmanItems(parentId?: string): any[] {
    const items = this.collections
      .filter(c => c.parentId === parentId)
      .sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

    return items.map((collection) => {
      if (collection.type === 'folder') {
        return {
          name: collection.name,
          item: this.buildPostmanItems(collection.id)
        };
      }

      return {
        name: collection.request?.name || collection.name,
        request: this.buildPostmanRequest(collection.request)
      };
    });
  }

  private buildPostmanRequest(request?: ApiRequest): any {
    if (!request) {
      return {
        method: 'GET',
        url: '',
      };
    }

    const headers = this.normalizeKeyValuePairs(request.headers)
      .map(({ key, value, enabled }) => ({
        key,
        value,
        disabled: !enabled
      }));

    const params = this.normalizeKeyValuePairs(request.params)
      .map(({ key, value, enabled }) => ({
        key,
        value,
        disabled: !enabled
      }));

    const body = this.buildPostmanBody(request.body);
    const auth = this.buildPostmanAuth(request.auth);

    return {
      method: request.method,
      header: headers,
      url: {
        raw: request.url || '',
        query: params
      },
      body,
      auth
    };
  }

  private buildPostmanBody(body?: ApiRequest['body']): any | undefined {
    if (!body || body.type === 'none') {
      return undefined;
    }

    if (body.type === 'json' || body.type === 'raw') {
      return { mode: 'raw', raw: body.content || '' };
    }

    if (body.type === 'form-urlencoded') {
      const urlencoded = this.parseUrlEncoded(body.content || '');
      return { mode: 'urlencoded', urlencoded };
    }

    if (body.type === 'form-data') {
      const formdata = this.parseFormData(body.content || '');
      return { mode: 'formdata', formdata };
    }

    return undefined;
  }

  private buildPostmanAuth(auth?: ApiRequest['auth']): any | undefined {
    if (!auth || auth.type === 'none') {
      return undefined;
    }

    if (auth.type === 'bearer' && auth.config.token) {
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.config.token }] };
    }

    if (auth.type === 'basic') {
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.config.username || '' },
          { key: 'password', value: auth.config.password || '' }
        ]
      };
    }

    if (auth.type === 'api-key') {
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.config.key || '' },
          { key: 'value', value: auth.config.value || '' },
          { key: 'in', value: auth.config.in || 'header' }
        ]
      };
    }

    if (auth.type === 'oauth2' && auth.config.accessToken) {
      return {
        type: 'oauth2',
        oauth2: [{ key: 'accessToken', value: auth.config.accessToken }]
      };
    }

    return undefined;
  }

  private normalizeKeyValuePairs(
    data?: ApiRequest['headers'] | ApiRequest['params']
  ): Array<{ key: string; value: string; enabled: boolean }> {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map(item => ({
        key: item.key,
        value: item.value,
        enabled: item.enabled !== false
      })).filter(item => item.key);
    }

    return Object.entries(data).map(([key, value]) => ({
      key,
      value,
      enabled: true
    }));
  }

  private parseUrlEncoded(content: string): Array<{ key: string; value: string; disabled?: boolean }> {
    if (!content) return [];
    return content.split('&').map((pair) => {
      const [rawKey, rawValue = ''] = pair.split('=');
      return {
        key: decodeURIComponent(rawKey || ''),
        value: decodeURIComponent(rawValue || '')
      };
    }).filter(item => item.key);
  }

  private parseFormData(content: string): Array<{ key: string; value: string; type?: string; disabled?: boolean }> {
    if (!content) return [];
    return content
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const [key, ...rest] = trimmed.split('=');
        return {
          key: key.trim(),
          value: rest.join('=').trim()
        };
      })
      .filter((item): item is { key: string; value: string } => !!item && !!item.key);
  }

  private downloadJson(baseName: string, data: unknown): void {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

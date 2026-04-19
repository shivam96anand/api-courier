import { Collection, ApiRequest } from '../../shared/types';
import { CollectionsCore } from './collections/collections-core';

export class CollectionsManager {
  private core: CollectionsCore;

  constructor() {
    this.core = new CollectionsCore();
  }

  initialize(): void {
    this.core.initialize();
    this.setupSaveTabListener();
    this.setupFolderRunListener();
  }

  /**
   * Run all request descendants of a folder sequentially. Each result is
   * dispatched via toast events so users see progress without us having to
   * build a dedicated runner UI here. Cancellation: clicking the button
   * again on a folder while it's running is a no-op for now (a follow-up
   * can add a proper Run modal).
   */
  private setupFolderRunListener(): void {
    let inFlight = false;
    document.addEventListener('folder-run-requested', (async (
      e: CustomEvent
    ) => {
      const folderId = e.detail?.folderId as string | undefined;
      if (!folderId || inFlight) return;
      inFlight = true;
      try {
        const collections = this.core.getCollections();
        const requests = this.collectFolderRequests(collections, folderId);
        if (requests.length === 0) {
          document.dispatchEvent(
            new CustomEvent('show-toast', {
              detail: { type: 'info', message: 'Folder has no requests.' },
            })
          );
          return;
        }
        document.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: {
              type: 'info',
              message: `Running ${requests.length} request${requests.length === 1 ? '' : 's'}\u2026`,
            },
          })
        );
        let ok = 0;
        let failed = 0;
        for (const req of requests) {
          try {
            // eslint-disable-next-line no-await-in-loop -- sequential by design
            const res = await window.restbro.request.send(req);
            if (res && typeof res.status === 'number' && res.status < 400) {
              ok += 1;
            } else {
              failed += 1;
            }
          } catch {
            failed += 1;
          }
        }
        document.dispatchEvent(
          new CustomEvent('show-toast', {
            detail: {
              type: failed === 0 ? 'success' : 'warning',
              message: `Folder run complete: ${ok} ok, ${failed} failed.`,
            },
          })
        );
      } finally {
        inFlight = false;
      }
    }) as EventListener);
  }

  private collectFolderRequests(
    collections: Collection[],
    rootId: string
  ): ApiRequest[] {
    const byParent = new Map<string, Collection[]>();
    for (const c of collections) {
      const key = c.parentId || '__root__';
      const arr = byParent.get(key) || [];
      arr.push(c);
      byParent.set(key, arr);
    }
    const out: ApiRequest[] = [];
    const walk = (id: string): void => {
      const children = (byParent.get(id) || []).sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      for (const child of children) {
        if (child.type === 'request' && child.request) {
          out.push(child.request);
        } else if (child.type === 'folder') {
          walk(child.id);
        }
      }
    };
    walk(rootId);
    return out;
  }

  /**
   * Listen for the Save / Save As shortcut dispatched by tabs-manager.
   * - If the tab has a `collectionId`, write the current request back to the
   *   collection (Save).
   * - Otherwise (or when forceSaveAs=true) we just emit a notification — a
   *   full destination picker is left for a follow-up; this still surfaces
   *   to the user that nothing was persisted, instead of silently dropping
   *   their Cmd+S.
   */
  private setupSaveTabListener(): void {
    document.addEventListener('request-save-tab', ((e: CustomEvent) => {
      const { request, collectionId, forceSaveAs } = e.detail || {};
      if (!request) return;
      if (!forceSaveAs && collectionId) {
        this.core.updateCollectionRequest(collectionId, request);
        document.dispatchEvent(
          new CustomEvent('request-saved', {
            detail: { requestId: request.id, collectionId },
          })
        );
        return;
      }
      // Save As / unsaved tab: surface a notification. A future PR can open
      // a destination-picker modal here.
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: {
            type: 'info',
            message: forceSaveAs
              ? 'Save As — drag this tab into a collection to save (picker coming soon).'
              : 'This tab is not part of any collection yet.',
          },
        })
      );
    }) as EventListener);
  }

  async setCollections(collections: Collection[]): Promise<void> {
    await this.core.setCollections(collections);
  }

  getCollections(): Collection[] {
    return this.core.getCollections();
  }

  getSelectedCollection(): Collection | undefined {
    return this.core.getSelectedCollection();
  }

  updateCollectionRequest(
    collectionId: string,
    updatedRequest: ApiRequest
  ): void {
    this.core.updateCollectionRequest(collectionId, updatedRequest);
  }

  setSelectedCollection(collectionId: string): void {
    this.core.setSelectedCollection(collectionId);
  }

  setActiveRequest(requestId?: string): void {
    this.core.setActiveRequest(requestId);
  }

  clearSelection(): void {
    this.core.clearSelection();
  }
}

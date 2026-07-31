/**
 * Collections State Persistence Module
 * Handles saving and loading of collections UI state (expanded + hidden items)
 */
import type { CollectionsUIState } from '../../../shared/types';

export class CollectionsStatePersistence {
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 500; // ms

  // Both slices share one persisted record, so saving either must carry the
  // other or it would be wiped.
  private expandedFolders: Set<string> = new Set();
  private hiddenCollections: Set<string> = new Set();

  /**
   * Load the persisted expanded folder IDs from main process
   */
  async loadExpandedFolders(): Promise<Set<string>> {
    await this.load();
    return new Set(this.expandedFolders);
  }

  /** Load the persisted hidden collection IDs from main process */
  async loadHiddenCollections(): Promise<Set<string>> {
    await this.load();
    return new Set(this.hiddenCollections);
  }

  private async load(): Promise<void> {
    try {
      const uiState = await window.restbro.collectionsState.get();
      this.expandedFolders = new Set(uiState.expandedFolderIds || []);
      this.hiddenCollections = new Set(uiState.hiddenCollectionIds || []);
    } catch (error) {
      console.error('Failed to load collections UI state:', error);
    }
  }

  /**
   * Save the expanded folder IDs to main process (debounced)
   */
  saveExpandedFolders(expandedFolders: Set<string>): void {
    this.expandedFolders = new Set(expandedFolders);
    this.queueSave();
  }

  /** Save the hidden collection IDs to main process (debounced) */
  saveHiddenCollections(hiddenCollections: Set<string>): void {
    this.hiddenCollections = new Set(hiddenCollections);
    this.queueSave();
  }

  private queueSave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      await this.write();
    }, this.DEBOUNCE_DELAY);
  }

  private async write(): Promise<void> {
    try {
      const uiState: CollectionsUIState = {
        expandedFolderIds: Array.from(this.expandedFolders),
        hiddenCollectionIds: Array.from(this.hiddenCollections),
      };
      await window.restbro.collectionsState.set(uiState);
    } catch (error) {
      console.error('Failed to save collections UI state:', error);
    }
  }

  /**
   * Immediately flush any pending save operation
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      await this.write();
    }
  }
}

/**
 * JSON Viewer State Persistence Module
 * Handles saving and loading of expanded node states per request ID
 * Implements LRU cache with 50-request limit
 */

interface JsonViewerUIState {
  expandedNodesByRequest: Record<string, string[]>;
  requestAccessOrder: string[];
}

export class JsonViewerStatePersistence {
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 500; // ms
  private readonly MAX_REQUESTS = 50; // LRU limit

  /**
   * Load expanded paths for a specific request
   */
  async loadExpandedPaths(requestId: string): Promise<Set<string>> {
    try {
      const uiState = await window.apiCourier.jsonViewerState.get();

      // Update access order (move to end)
      this.updateAccessOrder(uiState, requestId);

      const paths = uiState.expandedNodesByRequest[requestId] || [];
      return new Set(paths);
    } catch (error) {
      console.error('Failed to load JSON viewer UI state:', error);
      return new Set();
    }
  }

  /**
   * Save expanded paths for a specific request (debounced with LRU eviction)
   */
  saveExpandedPaths(requestId: string, expandedPaths: Set<string>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const uiState = await window.apiCourier.jsonViewerState.get();

        // Update expanded paths
        uiState.expandedNodesByRequest[requestId] = Array.from(expandedPaths);

        // Update access order
        this.updateAccessOrder(uiState, requestId);

        // Apply LRU eviction
        this.evictOldRequests(uiState);

        await window.apiCourier.jsonViewerState.set(uiState);
      } catch (error) {
        console.error('Failed to save JSON viewer UI state:', error);
      }
      this.debounceTimer = null;
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(uiState: JsonViewerUIState, requestId: string): void {
    // Remove from current position
    uiState.requestAccessOrder = uiState.requestAccessOrder.filter((id) => id !== requestId);

    // Add to end (most recent)
    uiState.requestAccessOrder.push(requestId);
  }

  /**
   * Evict oldest requests if over limit
   */
  private evictOldRequests(uiState: JsonViewerUIState): void {
    while (uiState.requestAccessOrder.length > this.MAX_REQUESTS) {
      const oldestRequestId = uiState.requestAccessOrder.shift();
      if (oldestRequestId) {
        delete uiState.expandedNodesByRequest[oldestRequestId];
      }
    }
  }

  /**
   * Clear state for a specific request
   */
  async clearRequestState(requestId: string): Promise<void> {
    try {
      const uiState = await window.apiCourier.jsonViewerState.get();

      delete uiState.expandedNodesByRequest[requestId];
      uiState.requestAccessOrder = uiState.requestAccessOrder.filter((id) => id !== requestId);

      await window.apiCourier.jsonViewerState.set(uiState);
    } catch (error) {
      console.error('Failed to clear JSON viewer state for request:', error);
    }
  }

  /**
   * Flush pending saves immediately
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

import { ApiRequest } from '../../shared/types';
import { RequestFormHandler } from './request/request-form-handler';
import { RequestEditorsManager } from './request/request-editors-manager';
import { RequestDataManager } from './request/request-data-manager';
import { buildFolderVars } from './request/variable-helper';
import { RequestStateCache, VariableContext } from '../types/request-types';

export class RequestManager {
  private formHandler: RequestFormHandler;
  private editorsManager: RequestEditorsManager;
  private dataManager: RequestDataManager;
  private storeCache: any = null;
  private storeCacheTime: number = 0;
  private readonly CACHE_TTL = 500; // Cache for 500ms
  private requestStateCache: Map<string, RequestStateCache> = new Map();
  private readonly REQUEST_CACHE_TTL = 5000; // Cache request state for 5 seconds
  private currentTabId?: string;

  constructor() {
    this.formHandler = new RequestFormHandler(
      (updates) => this.updateRequest(updates)
    );

    this.editorsManager = new RequestEditorsManager(
      (updates) => this.updateRequest(updates)
    );

    this.dataManager = new RequestDataManager(
      (message) => this.formHandler.showError(message),
      this.editorsManager
    );
  }

  private updateRequest(updates: Partial<ApiRequest>): void {
    this.dataManager.updateCurrentRequest(updates);
    this.refreshCacheForActiveTab();
  }

  initialize(): void {
    this.formHandler.setupRequestForm();
    this.formHandler.setupRequestTabs();
    this.dataManager.setupSendButton();
    this.dataManager.setupCopyCurlButton();
    this.dataManager.setupCancelButton();
    this.dataManager.setupCancelEventListener();
    this.dataManager.setupTabChangeListener();

    this.editorsManager.setupParamsEditor();
    this.editorsManager.setupHeadersEditor();
    this.editorsManager.setupBodyEditor();
    this.editorsManager.setupAuthEditor();

    this.formHandler.showEmptyState();

    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;
      this.loadRequest(
        activeTab ? activeTab.id : null,
        activeTab ? activeTab.request : null,
        activeTab ? activeTab.collectionId : undefined,
        activeTab ? activeTab.activeDetailsTab : undefined
      );
    });

    // Invalidate cache when environments or collections change
    document.addEventListener('environment-changed', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
    });

    document.addEventListener('collection-updated', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
    });

    document.addEventListener('globals-updated', () => {
      this.invalidateStoreCache();
      this.invalidateRequestStateCache();
    });
  }

  private async loadRequest(tabId: string | null, request: ApiRequest | null, collectionId?: string, activeDetailsTab?: string): Promise<void> {
    this.currentTabId = tabId || undefined;
    this.dataManager.setCurrentRequest(request);

    // Always clear UI state before loading a request so previous tab data doesn't linger
    this.clearForm();

    if (!request || !tabId) {
      this.currentTabId = undefined;
      this.formHandler.showEmptyState();
      return;
    }

    // Check if we have a cached state for this tab
    const cachedState = this.getCachedRequestState(tabId);
    if (cachedState) {
      // Always prefer the fresh request payload passed from tabs (it may have a newer token)
      const mergedCachedState = {
        ...cachedState,
        request: request
      };
      // Update the cache immediately so future switches stay in sync
      this.requestStateCache.set(tabId, { ...mergedCachedState, timestamp: Date.now() });
      // Load synchronously from cache for instant display
      this.loadRequestFromCache(mergedCachedState, activeDetailsTab);
      return;
    }

    // Load UI immediately for smooth transition
    this.formHandler.showRequestForm();
    this.formHandler.loadBasicRequestData(request);
    this.formHandler.restoreActiveDetailsTab(activeDetailsTab);

    // Load variable context and cache it
    const variableContext = await this.loadVariableContext(collectionId);

    // Set context for editors
    this.editorsManager.setVariableContext(
      variableContext.activeEnvironment,
      variableContext.globals,
      variableContext.folderVars
    );
    this.formHandler.setVariableContext(variableContext);

    // Load editors
    this.editorsManager.loadParams(request.params || {});
    this.editorsManager.loadHeaders(request.headers);

    if (request.body) {
      this.editorsManager.loadBody(request.body);
    }

    if (request.auth) {
      this.editorsManager.loadAuth(request.auth, collectionId);
    }

    // Cache the loaded state for next time
    this.cacheRequestState(tabId, request, collectionId, variableContext, activeDetailsTab);

    // Refresh highlighting asynchronously (non-blocking)
    // Use requestAnimationFrame for next paint cycle
    requestAnimationFrame(() => {
      this.formHandler.refreshAllInputHighlighting();
    });
  }

  /**
   * Load request from cached state (synchronous, instant)
   */
  private loadRequestFromCache(cachedState: RequestStateCache, activeDetailsTab?: string): void {
    const { request, variableContext, collectionId } = cachedState;

    // Load UI synchronously
    this.formHandler.showRequestForm();
    this.formHandler.loadBasicRequestData(request);
    this.formHandler.restoreActiveDetailsTab(activeDetailsTab || cachedState.activeDetailsTab);

    // Set cached variable context (synchronous)
    this.editorsManager.setVariableContext(
      variableContext.activeEnvironment,
      variableContext.globals,
      variableContext.folderVars
    );
    this.formHandler.setVariableContext(variableContext);

    // Load editors synchronously
    this.editorsManager.loadParams(request.params || {});
    this.editorsManager.loadHeaders(request.headers);

    if (request.body) {
      this.editorsManager.loadBody(request.body);
    }

    if (request.auth) {
      this.editorsManager.loadAuth(request.auth, collectionId);
    }

    // Refresh highlighting asynchronously (non-blocking)
    // Use requestAnimationFrame to apply highlighting after paint
    requestAnimationFrame(() => {
      this.formHandler.refreshAllInputHighlighting();
    });
  }

  /**
   * Load variable context and return it
   */
  private async loadVariableContext(collectionId?: string): Promise<VariableContext> {
    try {
      const state = await this.getCachedStore();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };
      const folderVars = buildFolderVars(collectionId, state.collections);

      return { activeEnvironment, globals, folderVars };
    } catch (error) {
      console.error('Failed to load variable context:', error);
      return { globals: { variables: {} }, folderVars: {} };
    }
  }

  /**
   * Get cached request state if available and fresh
   */
  private getCachedRequestState(tabId: string): RequestStateCache | null {
    const cached = this.requestStateCache.get(tabId);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.REQUEST_CACHE_TTL) {
      this.requestStateCache.delete(tabId);
      return null;
    }

    return cached;
  }

  /**
   * Cache request state for a tab
   */
  private cacheRequestState(
    tabId: string,
    request: ApiRequest,
    collectionId: string | undefined,
    variableContext: VariableContext,
    activeDetailsTab?: string
  ): void {
    this.requestStateCache.set(tabId, {
      tabId,
      request,
      collectionId,
      variableContext,
      activeDetailsTab,
      timestamp: Date.now()
    });
  }

  /**
   * Keep cached request in sync with latest edits so tab switches don't replay stale auth (tokens).
   */
  private refreshCacheForActiveTab(): void {
    if (!this.currentTabId) return;
    const cached = this.requestStateCache.get(this.currentTabId);
    if (!cached) return;

    const currentRequest = this.dataManager.getCurrentRequest();
    if (!currentRequest) return;

    this.requestStateCache.set(this.currentTabId, {
      ...cached,
      request: currentRequest,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate request state cache
   */
  private invalidateRequestStateCache(): void {
    this.requestStateCache.clear();
  }


  /**
   * Get store data with caching to reduce IPC calls during rapid tab switching
   */
  private async getCachedStore(): Promise<any> {
    const now = Date.now();
    if (this.storeCache && (now - this.storeCacheTime) < this.CACHE_TTL) {
      return this.storeCache;
    }

    this.storeCache = await window.apiCourier.store.get();
    this.storeCacheTime = now;
    return this.storeCache;
  }

  /**
   * Invalidate store cache when data changes
   */
  private invalidateStoreCache(): void {
    this.storeCache = null;
    this.storeCacheTime = 0;
  }

  private clearForm(): void {
    this.formHandler.clearBasicForm();
    this.editorsManager.clearEditors();
  }
}

// Event listeners for RestbroRenderer
import { TabsManager } from './components/tabs-manager';
import { CollectionsManager } from './components/collections-manager';
import { HistoryManager } from './components/history-manager';
import { EnvironmentManager } from './components/environments/environment-manager';
import { AskAiTab } from './components/AskAiTab';
import { VariableEditDialog } from './components/request/variable-edit-dialog';

interface EventListenersDeps {
  tabsManager: TabsManager;
  collectionsManager: CollectionsManager;
  historyManager: HistoryManager;
  environmentManager: EnvironmentManager;
  askAiTab: AskAiTab;
  saveState: () => Promise<void>;
}

/**
 * Sets up all event listeners for the RestbroRenderer
 */
export function setupEventListeners(deps: EventListenersDeps): void {
  const {
    tabsManager,
    collectionsManager,
    historyManager,
    environmentManager,
    askAiTab,
    saveState,
  } = deps;

  // Save state on page unload
  window.addEventListener('beforeunload', () => {
    saveState();
  });

  // Save state when tab becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveState();
    }
  });

  // Listen for requests to be opened in tabs
  document.addEventListener('open-request-in-tab', (e: Event) => {
    const customEvent = e as CustomEvent;
    const request = customEvent.detail.request;
    const collectionId = customEvent.detail.collectionId;

    if (request) {
      // Check if we have a previous response for this request
      const lastData = historyManager.getLastResponseForRequest(request.id);

      if (lastData && lastData.response.body) {
        // Open tab with the last known state (request + response)
        tabsManager.openRequestInTabWithResponse(
          lastData.request,
          lastData.response,
          collectionId
        );
      } else {
        // Open tab with just the request
        tabsManager.openRequestInTab(request, collectionId);
      }
    }
  });

  // Listen for tab changes to trigger state saves
  document.addEventListener('tabs-changed', () => {
    saveState();
  });

  // History modal: clicking a row opens a tab with the historical
  // request + its response so the user can re-send / inspect / clone it.
  document.addEventListener('open-request-from-history', (e: Event) => {
    const customEvent = e as CustomEvent;
    const request = customEvent.detail?.request;
    const response = customEvent.detail?.response;
    if (!request) return;
    if (response) {
      tabsManager.openRequestInTabWithResponse(request, response);
    } else {
      tabsManager.openRequestInTab(request);
    }
  });

  // Listen for history changes to trigger state saves
  document.addEventListener('history-changed', () => {
    saveState();
  });

  // Listen for request updates to save back to collection
  document.addEventListener('request-updated', (e: Event) => {
    const customEvent = e as CustomEvent;
    const updatedRequest = customEvent.detail.request;

    if (updatedRequest) {
      const activeTab = tabsManager.getActiveTab();

      // If this tab belongs to a collection, save the changes back to the collection
      if (activeTab && activeTab.collectionId) {
        collectionsManager.updateCollectionRequest(
          activeTab.collectionId,
          updatedRequest
        );
      }
    }
  });

  // Listen for collection changes to trigger state saves
  document.addEventListener('collections-changed', () => {
    saveState();
  });

  document.addEventListener('nav-order-changed', () => {
    saveState();
  });

  // Listen for tab changes to update collection selection
  document.addEventListener('tab-changed', (e: Event) => {
    const customEvent = e as CustomEvent;
    const activeTab = customEvent.detail.activeTab;

    // If the active tab belongs to a collection, select that collection
    if (activeTab && activeTab.collectionId) {
      collectionsManager.setSelectedCollection(activeTab.collectionId);
      collectionsManager.setActiveRequest(activeTab.request?.id);
    } else if (!activeTab) {
      // If no active tab, clear collection selection
      collectionsManager.clearSelection();
      collectionsManager.setActiveRequest(undefined);
    }
  });

  // Listen for Ask AI requests - open with context from response viewer
  document.addEventListener('open-ask-ai', (e: Event) => {
    const customEvent = e as CustomEvent;
    const response = customEvent.detail?.response;
    // Get the current request from tabs manager
    const activeTab = tabsManager.getActiveTab();
    const request = activeTab?.request;
    askAiTab.openWithContext(request, response);
  });

  // Listen for tab switching requests (for Ask AI to switch tabs)
  document.addEventListener('switch-to-tab', (e: Event) => {
    const customEvent = e as CustomEvent;
    const tabName = customEvent.detail.tabName;

    if (tabName) {
      // Use the app manager to switch tabs
      const navTab = document.querySelector(
        `[data-tab="${tabName}"]`
      ) as HTMLElement;
      if (navTab) {
        navTab.click();
      }
    }
  });

  // Listen for variable edit requests from tooltips
  document.addEventListener('edit-variable-requested', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { variableName, value, source } = customEvent.detail;

    // Get current state to populate the dialog
    const state = await window.restbro.store.get();
    const activeTab = tabsManager.getActiveTab();
    const collectionId = activeTab?.collectionId;

    const result = await VariableEditDialog.show(
      variableName,
      value,
      source,
      state.environments || [],
      state.activeEnvironmentId,
      state.globals || { variables: {} },
      collectionId,
      state.collections || []
    );

    if (result) {
      try {
        if (result.source === 'environment' && result.environmentId) {
          // Update environment variable
          const envIndex = state.environments.findIndex(
            (e: any) => e.id === result.environmentId
          );
          if (envIndex !== -1) {
            state.environments[envIndex].variables[result.variableName] =
              result.newValue;
            await window.restbro.store.set({
              environments: state.environments,
            });
            environmentManager.setEnvironments(state.environments);
            document.dispatchEvent(new CustomEvent('environment-changed'));
          }
        } else if (result.source === 'globals') {
          // Update global variable
          const globals = state.globals || { variables: {} };
          globals.variables[result.variableName] = result.newValue;
          await window.restbro.store.set({ globals });
          document.dispatchEvent(new CustomEvent('globals-updated'));
        } else if (result.source === 'folder' && result.folderId) {
          // Update folder variable
          await window.restbro.collection.update(result.folderId, {
            variables: {
              ...(collectionsManager
                .getCollections()
                .find((c) => c.id === result.folderId)?.variables || {}),
              [result.variableName]: result.newValue,
            },
          });
          // Refresh collections
          const updatedState = await window.restbro.store.get();
          await collectionsManager.setCollections(updatedState.collections);
          document.dispatchEvent(
            new CustomEvent('folder-variables-changed', {
              detail: { folderId: result.folderId },
            })
          );
        }
      } catch (error) {
        console.error('Failed to save variable:', error);
      }
    }
  });
}

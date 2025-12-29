import { ApiRequest, Environment, Globals } from '../../../shared/types';
import { setupAutocomplete } from './variable-autocomplete';
import { VariableContextHandler } from './variable-context-handler';
import { FormUIHandler } from './form-ui-handler';

/**
 * Main handler for the request form - coordinates between variable context,
 * form setup, and UI state handlers.
 */
export class RequestFormHandler {
  private onRequestUpdate: (updates: Partial<ApiRequest>) => void;
  private variableHandler: VariableContextHandler;
  private uiHandler: FormUIHandler;

  constructor(onRequestUpdate: (updates: Partial<ApiRequest>) => void) {
    this.onRequestUpdate = onRequestUpdate;
    this.variableHandler = new VariableContextHandler();
    this.uiHandler = new FormUIHandler();
  }

  setupRequestForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) {
      // Apply initial method color class
      this.uiHandler.updateMethodSelectColor(methodSelect);
      
      methodSelect.addEventListener('change', () => {
        this.onRequestUpdate({ method: methodSelect.value as any });
        this.uiHandler.updateMethodSelectColor(methodSelect);
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        this.onRequestUpdate({ url: urlInput.value });
        this.variableHandler.updateVariableIndicator(urlInput);
        if (!urlInput.dataset.variableHighlightListenerAttached) {
          this.variableHandler.refreshInputHighlight(urlInput);
        }
      });

      // Setup autocomplete for URL input
      setupAutocomplete(urlInput, () => this.variableHandler.getVariableContext());

      // Variable tooltips will be initialized by refreshVariableTooltips()
      // which is called from request-manager when a request is loaded
    }

    // Listen for auth inputs being rendered and add tooltips
    document.addEventListener('auth-inputs-rendered', () => {
      this.variableHandler.initializeAuthTooltips();
    });
  }

  /**
   * Set variable context directly (used when loading from cache)
   * Note: This only sets the context. Call refreshAllInputHighlighting() after
   * all inputs are loaded to apply highlighting.
   */
  public setVariableContext(context: { activeEnvironment?: Environment; globals: Globals; folderVars: Record<string, string> }): void {
    this.variableHandler.setVariableContext(context);

    // Ensure listeners are attached to URL input
    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    if (urlInput) {
      this.variableHandler.setupUrlInputListener(urlInput);
    }
  }

  /**
   * Refresh highlighting for all inputs (URL and auth inputs)
   * Call this after values are loaded to ensure highlighting is applied
   */
  public refreshAllInputHighlighting(): void {
    this.variableHandler.refreshAllInputHighlighting();
  }

  /**
   * Refresh variable tooltips (call this when environment changes or request loads)
   */
  public async refreshVariableTooltips(collectionId?: string): Promise<void> {
    await this.variableHandler.refreshVariableTooltips(collectionId);

    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    if (urlInput) {
      this.variableHandler.enhanceVariableInput(urlInput);
    }
  }

  setupRequestTabs(): void {
    const tabs = document.querySelectorAll('.request-details .tab');
    const sections = document.querySelectorAll('.request-details .section');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const sectionName = (tab as HTMLElement).dataset.section;

        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const section = document.getElementById(`${sectionName}-section`);
        if (section) {
          section.classList.add('active');
        }

        // Save the active tab state
        this.saveActiveDetailsTab(sectionName);

        // If Auth tab is clicked, hide the OAuth status box and refresh variable highlighting
        if (sectionName === 'auth') {
          const oauthStatus = document.getElementById('oauth-status');
          if (oauthStatus) {
            oauthStatus.style.display = 'none';
          }

          // CRITICAL FIX: Refresh variable highlighting when auth tab becomes active
          // This fixes the issue where variables lose color when switching between tabs
          // Use setTimeout to ensure the section is fully visible before refreshing
          setTimeout(() => {
            this.variableHandler.refreshAuthInputHighlighting();
          }, 0);
        }
      });
    });
  }

  /**
   * Save the active details tab for the current request tab
   */
  private saveActiveDetailsTab(tabName: string | undefined): void {
    if (!tabName) return;

    // Dispatch event to save the active details tab
    const event = new CustomEvent('active-details-tab-changed', {
      detail: { activeDetailsTab: tabName }
    });
    document.dispatchEvent(event);
  }

  /**
   * Restore the active details tab for a request
   */
  restoreActiveDetailsTab(activeDetailsTab?: string): void {
    const tabs = document.querySelectorAll('.request-details .tab');
    const sections = document.querySelectorAll('.request-details .section');

    // Default to 'params' if no active tab is saved
    const tabToActivate = activeDetailsTab || 'params';

    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    // Activate the saved tab
    const targetTab = document.querySelector(`.request-details .tab[data-section="${tabToActivate}"]`);
    const targetSection = document.getElementById(`${tabToActivate}-section`);

    if (targetTab) {
      targetTab.classList.add('active');
    }

    if (targetSection) {
      targetSection.classList.add('active');
    }
  }

  loadBasicRequestData(request: ApiRequest): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) {
      methodSelect.value = request.method;
      this.uiHandler.updateMethodSelectColor(methodSelect);
    }
    if (urlInput) urlInput.value = request.url;
  }

  clearBasicForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) {
      methodSelect.value = 'GET';
      this.uiHandler.updateMethodSelectColor(methodSelect);
    }
    if (urlInput) {
      urlInput.value = '';
      this.uiHandler.clearUrlInputOverlay(urlInput);
    }
  }

  showEmptyState(): void {
    this.uiHandler.showEmptyState();
  }

  showRequestForm(): void {
    this.uiHandler.showRequestForm();
  }

  showError(message: string): void {
    this.uiHandler.showError(message);
  }
}

import { Environment, Globals } from '../../../shared/types';
import { detectVariables, buildFolderVars, addVariableHighlighting } from './variable-helper';
import { setupAutocomplete } from './variable-autocomplete';

/**
 * Handles variable context management, highlighting, and tooltips for request inputs.
 * Manages caching and provides variable resolution context for URL and auth inputs.
 */
export class VariableContextHandler {
  private currentCollectionId?: string;
  private activeEnvironment?: Environment;
  private globals: Globals = { variables: {} };
  private folderVars: Record<string, string> = {};
  private storeCache: any = null;
  private storeCacheTime: number = 0;
  private readonly CACHE_TTL = 500; // Cache for 500ms

  /**
   * Get the current active environment
   */
  getActiveEnvironment(): Environment | undefined {
    return this.activeEnvironment;
  }

  /**
   * Get the current globals
   */
  getGlobals(): Globals {
    return this.globals;
  }

  /**
   * Get the current folder variables
   */
  getFolderVars(): Record<string, string> {
    return this.folderVars;
  }

  /**
   * Get variable context for autocomplete
   */
  getVariableContext(): { activeEnvironment?: Environment; globals: Globals; folderVars: Record<string, string> } {
    return {
      activeEnvironment: this.activeEnvironment,
      globals: this.globals,
      folderVars: this.folderVars
    };
  }

  /**
   * Set variable context directly (used when loading from cache)
   * Note: This only sets the context. Call refreshAllInputHighlighting() after
   * all inputs are loaded to apply highlighting.
   */
  public setVariableContext(context: { activeEnvironment?: Environment; globals: Globals; folderVars: Record<string, string> }): void {
    this.activeEnvironment = context.activeEnvironment;
    this.globals = context.globals;
    this.folderVars = context.folderVars;
  }

  /**
   * Refresh variable tooltips (call this when environment changes or request loads)
   */
  public async refreshVariableTooltips(collectionId?: string): Promise<void> {
    this.currentCollectionId = collectionId;
    // CRITICAL: Always load context, even if URL input doesn't exist
    // This ensures this.folderVars, this.activeEnvironment, this.globals are set
    // for auth inputs and other fields
    await this.loadVariableContext(collectionId);
  }

  /**
   * Loads variable context (environment, globals, folder vars) into cache
   */
  private async loadVariableContext(collectionId?: string): Promise<void> {
    try {
      const state = await this.getCachedStore();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };
      const folderVars = buildFolderVars(collectionId, state.collections);

      // Cache context for all inputs to use
      this.activeEnvironment = activeEnvironment;
      this.globals = globals;
      this.folderVars = folderVars;
    } catch (error) {
      console.error('Failed to load variable context:', error);
    }
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
   * Updates the visual indicator that a field contains variables
   */
  public updateVariableIndicator(inputElement: HTMLInputElement): void {
    const variables = detectVariables(inputElement.value);
    if (variables.length > 0) {
      inputElement.classList.add('has-variables');
    } else {
      inputElement.classList.remove('has-variables');
    }
  }

  /**
   * Add variable highlighting and tooltips to a text input, reusing cached context
   */
  public enhanceVariableInput(inputElement: HTMLInputElement): void {
    // Always add input listener first, so it works even if value is loaded later
    if (!inputElement.dataset.variableHighlightListenerAttached) {
      inputElement.addEventListener('input', () => {
        this.refreshInputHighlight(inputElement);
      });
      inputElement.dataset.variableHighlightListenerAttached = 'true';
    }

    // For password fields, only apply highlighting if there are variables
    // If there ARE variables, we want to show them for easy copying
    if (inputElement.type === 'password') {
      const hasVariables = detectVariables(inputElement.value).length > 0;
      if (!hasVariables) {
        return; // Keep as password field (dots) if no variables
      }
    }

    this.refreshInputHighlight(inputElement);
  }

  /**
   * Refresh highlighting state for an input
   */
  public refreshInputHighlight(inputElement: HTMLInputElement): void {
    addVariableHighlighting(inputElement, this.activeEnvironment, this.globals, this.folderVars);
    this.updateVariableIndicator(inputElement);
  }

  /**
   * Refresh highlighting for all inputs (URL and auth inputs)
   * Call this after values are loaded to ensure highlighting is applied
   */
  public refreshAllInputHighlighting(): void {
    // Refresh URL input (tooltips are added automatically in refreshInputHighlight)
    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    if (urlInput && urlInput.value) {
      this.refreshInputHighlight(urlInput);
    }

    // Refresh auth inputs
    this.refreshAuthInputHighlighting();
  }

  /**
   * Refresh highlighting for all auth inputs (used when context is updated)
   */
  public refreshAuthInputHighlighting(): void {
    const authConfig = document.getElementById('auth-config');
    if (!authConfig) return;

    const inputs = authConfig.querySelectorAll('input[type="text"], input[type="password"]');
    inputs.forEach((input) => {
      const inputElement = input as HTMLInputElement;

      // Ensure listener is attached
      if (!inputElement.dataset.variableHighlightListenerAttached) {
        inputElement.addEventListener('input', () => {
          this.refreshInputHighlight(inputElement);
        });
        inputElement.dataset.variableHighlightListenerAttached = 'true';
      }

      // Apply highlighting to current value
      if (inputElement.value) {
        this.refreshInputHighlight(inputElement);
      }
    });
  }

  /**
   * Initializes variable tooltips for all auth config inputs
   */
  public initializeAuthTooltips(): void {
    try {
      const authConfig = document.getElementById('auth-config');
      if (!authConfig) return;

      // CRITICAL: Attach input listeners FIRST (synchronously) to avoid race condition
      // with loadConfigToDOM() setTimeout that loads values
      const inputs = authConfig.querySelectorAll('input[type="text"], input[type="password"]');

      inputs.forEach((input) => {
        const inputElement = input as HTMLInputElement;
        // Attach input listener immediately if not already attached
        if (!inputElement.dataset.variableHighlightListenerAttached) {
          inputElement.addEventListener('input', () => {
            this.refreshInputHighlight(inputElement);
          });
          inputElement.dataset.variableHighlightListenerAttached = 'true';

          // Setup autocomplete for auth inputs
          setupAutocomplete(inputElement, () => this.getVariableContext());
        }
      });

      // IMPORTANT: Use already-loaded context instead of reloading from cache
      // The context has already been loaded by refreshVariableTooltips() with the correct collectionId
      // Reloading from cache can give stale data or wrong folder variables

      // Don't try to highlight now - inputs are empty at this point
      // The setTimeout in loadConfigToDOM will populate values and dispatch input events
      // which will trigger refreshInputHighlight with the correct context
    } catch (error) {
      console.error('Failed to initialize auth tooltips:', error);
    }
  }

  /**
   * Setup URL input listener for variable highlighting
   */
  public setupUrlInputListener(urlInput: HTMLInputElement): void {
    if (!urlInput.dataset.variableHighlightListenerAttached) {
      urlInput.addEventListener('input', () => {
        this.updateVariableIndicator(urlInput);
        this.refreshInputHighlight(urlInput);
      });
      urlInput.dataset.variableHighlightListenerAttached = 'true';
    }
  }
}

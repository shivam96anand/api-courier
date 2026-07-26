import { Environment, Globals, KeyValuePair } from '../../../shared/types';
import {
  detectVariables,
  buildFolderVars,
  addVariableHighlighting,
} from './variable-helper';
import { setupAutocomplete } from './variable-autocomplete';
import { resolveTemplate } from './request-variable-resolver';
import { buildUrlWithParams } from './request-builder-utils';
import { UIHelpers } from './UIHelpers';

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
  private readonly uiHelpers = new UIHelpers();

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
  getVariableContext(): {
    activeEnvironment?: Environment;
    globals: Globals;
    folderVars: Record<string, string>;
  } {
    return {
      activeEnvironment: this.activeEnvironment,
      globals: this.globals,
      folderVars: this.folderVars,
    };
  }

  /**
   * Set variable context directly (used when loading from cache)
   * Note: This only sets the context. Call refreshAllInputHighlighting() after
   * all inputs are loaded to apply highlighting.
   */
  public setVariableContext(context: {
    activeEnvironment?: Environment;
    globals: Globals;
    folderVars: Record<string, string>;
  }): void {
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
        ? state.environments.find(
            (e: any) => e.id === state.activeEnvironmentId
          )
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
    if (this.storeCache && now - this.storeCacheTime < this.CACHE_TTL) {
      return this.storeCache;
    }

    this.storeCache = await window.restbro.store.get();
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
    addVariableHighlighting(
      inputElement,
      this.activeEnvironment,
      this.globals,
      this.folderVars
    );
    this.updateVariableIndicator(inputElement);
  }

  /**
   * Refresh highlighting for all inputs (URL and auth inputs)
   * Call this after values are loaded to ensure highlighting is applied
   */
  public refreshAllInputHighlighting(): void {
    // Refresh URL input (tooltips are added automatically in refreshInputHighlight)
    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    if (urlInput) {
      if (urlInput.value) {
        this.refreshInputHighlight(urlInput);
      }
      // Keep the resolved-URL preview in sync with the current context
      // (environment / globals / folder), e.g. after switching environments.
      this.updateResolvedUrlPreview(urlInput);
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

    const inputs = authConfig.querySelectorAll(
      'input[type="text"], input[type="password"]'
    );
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
      const inputs = authConfig.querySelectorAll(
        'input[type="text"], input[type="password"]'
      );

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
   * Setup URL input listener for variable highlighting + resolved-URL preview.
   * The native `title` attribute shows the resolved URL on hover so users can
   * verify what `{{base}}/foo` actually expands to without sending the request.
   * This is one of the most-loved Postman features.
   */
  public setupUrlInputListener(urlInput: HTMLInputElement): void {
    if (!urlInput.dataset.variableHighlightListenerAttached) {
      urlInput.addEventListener('input', () => {
        this.updateVariableIndicator(urlInput);
        this.refreshInputHighlight(urlInput);
        this.updateResolvedUrlPreview(urlInput);
      });
      urlInput.dataset.variableHighlightListenerAttached = 'true';
      this.setupUrlPreviewCopy();
      this.setupParamsPreviewSync(urlInput);
      // Initial paint (in case URL was loaded before the listener attached).
      this.updateResolvedUrlPreview(urlInput);
    }
  }

  /**
   * Wires the copy button on the resolved-URL preview row (one-time). Copies
   * the full resolved URL (including appended query params) shown in the
   * preview to the clipboard.
   */
  private setupUrlPreviewCopy(): void {
    const previewEl = document.getElementById('url-preview');
    const copyBtn = previewEl?.querySelector(
      '.url-preview__copy'
    ) as HTMLButtonElement | null;
    const valueEl = previewEl?.querySelector(
      '.url-preview__value'
    ) as HTMLElement | null;
    if (!copyBtn || copyBtn.dataset.wired) return;
    copyBtn.dataset.wired = 'true';
    copyBtn.addEventListener('click', () => {
      const url = valueEl?.textContent?.trim();
      if (!url || !navigator.clipboard) return;
      void navigator.clipboard
        .writeText(url)
        .then(() => this.uiHelpers.showToast('URL copied to clipboard'))
        .catch(() => this.uiHelpers.showToast('Failed to copy URL'));
    });
  }

  /**
   * Keeps the resolved-URL preview in sync with the Params editor in real time.
   * The editor emits `input` / `change` as rows are edited, toggled or removed;
   * we mirror those into a preview refresh so appended query params update live.
   * Wired once via event delegation on the (stable) `#params-editor` element.
   */
  private setupParamsPreviewSync(urlInput: HTMLInputElement): void {
    const paramsEditor = document.getElementById('params-editor');
    if (!paramsEditor || paramsEditor.dataset.urlPreviewSyncAttached) return;
    paramsEditor.dataset.urlPreviewSyncAttached = 'true';
    const refresh = (): void => this.updateResolvedUrlPreview(urlInput);
    paramsEditor.addEventListener('input', refresh);
    paramsEditor.addEventListener('change', refresh);
    // Removing a row fires only a click (no native input/change), so listen for
    // the ParamsManager mutation event too, keeping the preview real-time.
    paramsEditor.addEventListener('params-editor-mutated', refresh);
  }

  /**
   * Variable sources for the current context. Request-level variables are not
   * tracked here, so only env / folder / globals participate. Shared by the URL
   * and query-param resolution used to build the preview.
   */
  private buildVariableSources(): {
    requestVars: Record<string, string>;
    folderVars: Record<string, string>;
    envVars: Record<string, string>;
    globalVars: Record<string, string>;
  } {
    return {
      requestVars: {},
      folderVars: this.folderVars || {},
      envVars: this.activeEnvironment?.variables || {},
      globalVars: this.globals?.variables || {},
    };
  }

  /**
   * Collects the enabled query parameters currently in the Params editor,
   * resolving `{{vars}}` in their keys/values so the preview mirrors exactly
   * what will be sent. Reads straight from the DOM so it always reflects the
   * live state (same approach as reading the URL from `#request-url`).
   */
  private collectResolvedParams(): KeyValuePair[] {
    const editor = document.getElementById('params-editor');
    if (!editor) return [];

    const sources = this.buildVariableSources();
    const params: KeyValuePair[] = [];

    editor.querySelectorAll('.kv-row').forEach((row) => {
      const checkbox = row.querySelector(
        '.kv-checkbox'
      ) as HTMLInputElement | null;
      const keyInput = row.querySelector(
        '.key-input'
      ) as HTMLInputElement | null;
      const valueInput = row.querySelector(
        '.value-input'
      ) as HTMLInputElement | null;

      if (checkbox && !checkbox.checked) return;
      const key = (keyInput?.value ?? '').trim();
      if (!key) return;

      params.push({
        key: resolveTemplate(key, sources),
        value: resolveTemplate((valueInput?.value ?? '').trim(), sources),
        enabled: true,
      });
    });

    return params;
  }

  /**
   * Computes the resolved URL (expanding `{{vars}}` via the active
   * environment / globals / folder values) plus the enabled query params from
   * the Params editor, and reflects the full "what will be sent" URL in:
   *  - the URL input's native `title` (hover tooltip), and
   *  - the visible `#url-preview` row below the URL bar (Insomnia-style).
   * Always shown while the URL bar has a value; cleared only when it's empty.
   */
  private updateResolvedUrlPreview(urlInput: HTMLInputElement): void {
    const previewEl = document.getElementById('url-preview');
    const valueEl = previewEl?.querySelector(
      '.url-preview__value'
    ) as HTMLElement | null;

    const clear = (): void => {
      urlInput.removeAttribute('title');
      previewEl?.classList.remove('is-visible');
      if (valueEl) {
        valueEl.textContent = '';
        valueEl.removeAttribute('title');
      }
    };

    const raw = urlInput.value;
    if (!raw) {
      clear();
      return;
    }

    try {
      const resolvedUrl = raw.includes('{{')
        ? resolveTemplate(raw, this.buildVariableSources())
        : raw;

      // Append the enabled (resolved) query params so the preview reflects the
      // full URL that will be sent — consistent with the cURL preview.
      const finalUrl = buildUrlWithParams(
        resolvedUrl,
        this.collectResolvedParams()
      );

      // Always surface the preview so the exact URL that will be sent is
      // visible — regardless of whether variables were resolved or query
      // params were appended. `raw` is non-empty here, so `finalUrl` is too.
      if (finalUrl) {
        urlInput.title = `Resolved: ${finalUrl}`;
        if (valueEl) {
          valueEl.textContent = finalUrl;
          valueEl.title = finalUrl;
        }
        previewEl?.classList.add('is-visible');
      } else {
        clear();
      }
    } catch {
      // ignore — the preview is purely a UX nicety
    }
  }
}

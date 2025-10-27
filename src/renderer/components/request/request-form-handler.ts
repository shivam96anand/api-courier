import { ApiRequest } from '../../../shared/types';
import { addVariableTooltips, detectVariables, buildFolderVars } from './variable-helper';

export class RequestFormHandler {
  private onRequestUpdate: (updates: Partial<ApiRequest>) => void;
  private currentCollectionId?: string;

  constructor(onRequestUpdate: (updates: Partial<ApiRequest>) => void) {
    this.onRequestUpdate = onRequestUpdate;
  }

  setupRequestForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) {
      methodSelect.addEventListener('change', () => {
        this.onRequestUpdate({ method: methodSelect.value as any });
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        this.onRequestUpdate({ url: urlInput.value });
        this.updateVariableIndicator(urlInput);
      });

      // Initialize variable tooltips
      this.initializeVariableTooltips(urlInput);
    }

    // Listen for auth inputs being rendered and add tooltips
    document.addEventListener('auth-inputs-rendered', () => {
      this.initializeAuthTooltips();
    });
  }

  /**
   * Refresh variable tooltips (call this when environment changes or request loads)
   */
  public async refreshVariableTooltips(collectionId?: string): Promise<void> {
    this.currentCollectionId = collectionId;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;
    if (urlInput) {
      await this.initializeVariableTooltips(urlInput, collectionId);
    }
  }

  /**
   * Updates the visual indicator that a field contains variables
   */
  private updateVariableIndicator(inputElement: HTMLInputElement): void {
    const variables = detectVariables(inputElement.value);
    if (variables.length > 0) {
      inputElement.classList.add('has-variables');
    } else {
      inputElement.classList.remove('has-variables');
    }
  }

  /**
   * Initializes variable tooltips for an input field
   */
  private async initializeVariableTooltips(inputElement: HTMLInputElement, collectionId?: string): Promise<void> {
    try {
      // Get current app state for environment and globals
      const state = await window.apiCourier.store.get();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };

      // Build folder variables from ancestor chain
      const folderVars = buildFolderVars(collectionId, state.collections);

      console.log('[RequestFormHandler] Building tooltips with collectionId:', collectionId);
      console.log('[RequestFormHandler] Folder variables:', folderVars);

      // Add tooltip functionality
      addVariableTooltips(inputElement, activeEnvironment, globals, folderVars);

      // Update indicator on load
      this.updateVariableIndicator(inputElement);
    } catch (error) {
      console.error('Failed to initialize variable tooltips:', error);
    }
  }

  /**
   * Initializes variable tooltips for all auth config inputs
   */
  private async initializeAuthTooltips(): Promise<void> {
    try {
      const authConfig = document.getElementById('auth-config');
      if (!authConfig) return;

      // Get current app state for environment and globals
      const state = await window.apiCourier.store.get();
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };

      // Build folder variables using stored collectionId
      const folderVars = buildFolderVars(this.currentCollectionId, state.collections);

      console.log('[RequestFormHandler] Initializing auth tooltips with collectionId:', this.currentCollectionId);

      // Add tooltips to all input elements in auth config
      const inputs = authConfig.querySelectorAll('input[type="text"], input[type="password"]');
      inputs.forEach((input) => {
        addVariableTooltips(input as HTMLInputElement, activeEnvironment, globals, folderVars);
        this.updateVariableIndicator(input as HTMLInputElement);
      });
    } catch (error) {
      console.error('Failed to initialize auth tooltips:', error);
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

        // If Auth tab is clicked, hide the OAuth status box completely
        if (sectionName === 'auth') {
          const oauthStatus = document.getElementById('oauth-status');
          if (oauthStatus) {
            oauthStatus.style.display = 'none';
          }
        }
      });
    });
  }

  loadBasicRequestData(request: ApiRequest): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) methodSelect.value = request.method;
    if (urlInput) urlInput.value = request.url;
  }

  clearBasicForm(): void {
    const methodSelect = document.getElementById('request-method') as HTMLSelectElement;
    const urlInput = document.getElementById('request-url') as HTMLInputElement;

    if (methodSelect) methodSelect.value = 'GET';
    if (urlInput) urlInput.value = '';
  }

  showEmptyState(): void {
    const requestPanel = document.querySelector('.request-panel');
    if (!requestPanel) return;

    const requestForm = document.querySelector('.request-form') as HTMLElement;
    if (requestForm) requestForm.style.display = 'none';

    let emptyState = document.getElementById('request-empty-state');
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.id = 'request-empty-state';
      emptyState.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: var(--text-secondary);
        font-size: 14px;
        text-align: center;
        padding: 40px 20px;
      `;

      const icon = document.createElement('div');
      icon.textContent = '📄';
      icon.style.cssText = `
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      `;

      const title = document.createElement('h3');
      title.textContent = 'No Request Selected';
      title.style.cssText = `
        margin: 0 0 8px 0;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 500;
      `;

      const description = document.createElement('p');
      description.textContent = 'Select a request from collections or create a new request tab to get started';
      description.style.cssText = `
        margin: 0;
        line-height: 1.5;
        max-width: 300px;
      `;

      emptyState.appendChild(icon);
      emptyState.appendChild(title);
      emptyState.appendChild(description);
      requestPanel.appendChild(emptyState);
    } else {
      emptyState.style.display = 'flex';
    }
  }

  showRequestForm(): void {
    const requestForm = document.querySelector('.request-form') as HTMLElement;
    const emptyState = document.getElementById('request-empty-state');

    if (requestForm) requestForm.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
  }

  showError(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      max-width: 300px;
      word-wrap: break-word;
    `;

    document.body.appendChild(errorDiv);
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 5000);
  }
}
import { createIconElement } from '../../utils/icons';

/**
 * Handles UI state for the request form - empty states, form visibility, and error display.
 */
export class FormUIHandler {
  /**
   * Updates the method select element's color class based on the current HTTP method
   */
  public updateMethodSelectColor(methodSelect: HTMLSelectElement): void {
    // Remove all existing method color classes
    methodSelect.classList.remove(
      'method-get', 'method-post', 'method-put', 
      'method-patch', 'method-delete', 'method-head', 'method-options'
    );
    // Add the appropriate class for the current method
    const method = methodSelect.value.toLowerCase();
    methodSelect.classList.add(`method-${method}`);
  }

  /**
   * Show empty state when no request is selected
   */
  public showEmptyState(): void {
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
      icon.style.cssText = `
        margin-bottom: 16px;
        opacity: 0.5;
        width: 48px;
        height: 48px;
      `;
      icon.appendChild(createIconElement('file', { style: { width: '100%', height: '100%' } }));

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

  /**
   * Show the request form (hide empty state)
   */
  public showRequestForm(): void {
    const requestForm = document.querySelector('.request-form') as HTMLElement;
    const emptyState = document.getElementById('request-empty-state');

    if (requestForm) requestForm.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
  }

  /**
   * Show a temporary error message
   */
  public showError(message: string): void {
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

  /**
   * Clear the URL input highlighting overlay
   */
  public clearUrlInputOverlay(urlInput: HTMLInputElement): void {
    // Remove any leftover variable overlay/indicator from the previous tab
    const existing = urlInput.parentElement?.querySelector('.variable-highlight-container');
    if (existing) existing.remove();
    urlInput.classList.remove('has-variable-overlay', 'has-variables');
  }
}

/**
 * FullscreenModalUI - Handles modal creation and styling
 * Manages the visual structure of the fullscreen viewer modal
 */

import { VIEWER_CLASSES } from './types';

export interface ModalUIComponents {
  modal: HTMLElement;
  toolbarContainer: HTMLElement;
  rawContainer: HTMLElement;
  prettyContainer: HTMLElement;
  searchContainer: HTMLElement;
  backdrop: HTMLElement;
}

export class FullscreenModalUI {
  /**
   * Creates the complete modal structure
   */
  createModal(): ModalUIComponents {
    const modal = document.createElement('div');
    modal.className = `${VIEWER_CLASSES.fullscreen} json-viewer-fullscreen`;

    const backdrop = document.createElement('div');
    backdrop.className = 'fullscreen-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'fullscreen-dialog';

    const header = this.createHeader();
    const body = this.createBody();

    dialog.appendChild(header.headerElement);
    dialog.appendChild(body.bodyElement);
    modal.appendChild(backdrop);
    modal.appendChild(dialog);

    return {
      modal,
      backdrop,
      toolbarContainer: body.toolbarContainer,
      rawContainer: body.rawContainer,
      prettyContainer: body.prettyContainer,
      searchContainer: body.searchContainer
    };
  }

  /**
   * Creates the modal header with title and close button
   */
  private createHeader(): { headerElement: HTMLElement; closeButton: HTMLElement } {
    const header = document.createElement('div');
    header.className = 'fullscreen-header';

    const title = document.createElement('h2');
    title.className = 'fullscreen-title';
    title.textContent = 'JSON Viewer - Full Screen';

    const closeButton = document.createElement('button');
    closeButton.className = 'fullscreen-close';
    closeButton.innerHTML = '×';
    closeButton.title = 'Close (ESC)';

    header.appendChild(title);
    header.appendChild(closeButton);

    return { headerElement: header, closeButton };
  }

  /**
   * Creates the modal body with content containers
   */
  private createBody(): {
    bodyElement: HTMLElement;
    toolbarContainer: HTMLElement;
    rawContainer: HTMLElement;
    prettyContainer: HTMLElement;
    searchContainer: HTMLElement;
  } {
    const body = document.createElement('div');
    body.className = 'fullscreen-body';

    // Toolbar container
    const toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'fullscreen-toolbar';
    body.appendChild(toolbarContainer);

    // Content container with tabs
    const contentContainer = document.createElement('div');
    contentContainer.className = 'fullscreen-content';

    // Pretty view container
    const prettyContainer = document.createElement('div');
    prettyContainer.className = 'content-view pretty-view';
    prettyContainer.id = 'fullscreen-pretty-view';
    contentContainer.appendChild(prettyContainer);

    // Raw view container
    const rawContainer = document.createElement('div');
    rawContainer.className = 'content-view raw-view';
    rawContainer.id = 'fullscreen-raw-view';
    contentContainer.appendChild(rawContainer);

    // Headers view container (placeholder)
    const headersContainer = document.createElement('div');
    headersContainer.className = 'content-view headers-view';
    headersContainer.innerHTML = '<div class="placeholder">Headers view not implemented in fullscreen mode</div>';
    contentContainer.appendChild(headersContainer);

    body.appendChild(contentContainer);

    // Search bar container (absolute positioned)
    const searchContainer = document.createElement('div');
    searchContainer.className = 'fullscreen-search-container';
    body.appendChild(searchContainer);

    return {
      bodyElement: body,
      toolbarContainer,
      rawContainer,
      prettyContainer,
      searchContainer
    };
  }

  /**
   * Applies fullscreen modal styles to the document
   */
  applyStyles(): void {
    if (document.querySelector('#fullscreen-viewer-styles')) {
      return; // Styles already applied
    }

    const style = document.createElement('style');
    style.id = 'fullscreen-viewer-styles';
    style.textContent = `
      .json-viewer-fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .fullscreen-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .fullscreen-dialog {
        position: relative;
        width: 85%;
        height: 85%;
        max-width: 1200px;
        background: var(--bg-primary, #fff);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: modalSlideIn 0.3s ease-out;
      }

      @keyframes modalSlideIn {
        from {
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .fullscreen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        flex-shrink: 0;
      }

      .fullscreen-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary, #333);
      }

      .fullscreen-close {
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        color: var(--text-secondary, #666);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .fullscreen-close:hover {
        background: var(--bg-tertiary, #e9ecef);
        color: var(--text-primary, #333);
      }

      .fullscreen-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      .fullscreen-toolbar {
        flex-shrink: 0;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        min-height: 48px;
        z-index: 1;
      }

      .fullscreen-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .content-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .content-view.pretty-view,
      .content-view.raw-view {
        padding: 0;
      }

      .content-view .placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary, #666);
        font-size: 14px;
      }

      .fullscreen-search-container {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 10;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .fullscreen-dialog {
          width: 95%;
          height: 95%;
        }

        .fullscreen-header {
          padding: 12px 16px;
        }

        .fullscreen-title {
          font-size: 16px;
        }
      }

      /* Dark theme support */
      @media (prefers-color-scheme: dark) {
        .fullscreen-dialog {
          background: var(--bg-primary, #1e1e1e);
        }

        .fullscreen-header {
          background: var(--bg-secondary, #252526);
          border-bottom-color: var(--border-color, #333);
        }

        .fullscreen-title {
          color: var(--text-primary, #fff);
        }

        .fullscreen-close {
          color: var(--text-secondary, #ccc);
        }

        .fullscreen-close:hover {
          background: var(--bg-tertiary, #333);
          color: var(--text-primary, #fff);
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Shows a toast notification
   */
  showToast(message: string): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--primary-color, #007bff);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 13px;
      animation: fadeInOut 2s ease-in-out forwards;
    `;
    toast.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-10px); }
        20%, 80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 2000);
  }
}

import { JsonViewer } from '../JsonViewer';

export class JsonViewerUtilities {
  public static exportJson(jsonData: any): void {
    if (!jsonData) return;

    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `json-export-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public static openFullscreen(jsonData: any): void {
    if (!jsonData) return;

    const modal = document.createElement('div');
    modal.className = 'json-fullscreen-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">JSON Viewer - Full Screen</div>
          <div class="modal-actions">
            <button id="fs-copy-btn" class="response-action-btn" title="Copy JSON to clipboard">Copy</button>
            <button id="fs-search-btn" class="response-action-btn" title="Search within JSON">Search</button>
            <button id="fs-collapse-btn" class="response-action-btn" title="Collapse all JSON nodes">Collapse</button>
            <button id="fs-expand-btn" class="response-action-btn" title="Expand all JSON nodes">Expand</button>
            <button id="fs-top-btn" class="response-action-btn" title="Scroll to top">Top</button>
            <button id="fs-bottom-btn" class="response-action-btn" title="Scroll to bottom">Bottom</button>
            <button id="fs-ask-ai-btn" class="response-action-btn ask-ai-btn" title="Ask AI about this JSON">Ask AI</button>
            <button class="close-btn">×</button>
          </div>
        </div>
        <div class="modal-body">
          <div id="fullscreen-json-viewer"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const fullscreenViewer = new JsonViewer('fullscreen-json-viewer');
    fullscreenViewer.setData(jsonData);

    // Action button handlers - using exact same logic as JsonViewerPanel
    const jsonString = JSON.stringify(jsonData, null, 2);
    
    const copyBtn = modal.querySelector('#fs-copy-btn') as HTMLButtonElement;
    copyBtn?.addEventListener('click', () => {
      if (!jsonString) {
        // Silently return without toast notification
        return;
      }

      navigator.clipboard.writeText(jsonString).then(() => {
        // Silently copy without toast notification
      }).catch(() => {
        // Silently fail without toast notification
      });
    });

    const searchBtn = modal.querySelector('#fs-search-btn') as HTMLButtonElement;
    searchBtn?.addEventListener('click', () => {
      // Trigger search functionality - same as JsonViewerPanel
      const searchEvent = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true });
      document.dispatchEvent(searchEvent);
    });

    const collapseBtn = modal.querySelector('#fs-collapse-btn') as HTMLButtonElement;
    collapseBtn?.addEventListener('click', () => {
      if (!fullscreenViewer) {
        // Silently return without toast notification
        return;
      }
      
      fullscreenViewer.collapseAll();
      // No toast notification
    });

    const expandBtn = modal.querySelector('#fs-expand-btn') as HTMLButtonElement;
    expandBtn?.addEventListener('click', () => {
      if (!fullscreenViewer) {
        // Silently return without toast notification
        return;
      }
      
      fullscreenViewer.expandAll();
      // No toast notification
    });

    const topBtn = modal.querySelector('#fs-top-btn') as HTMLButtonElement;
    topBtn?.addEventListener('click', () => {
      const content = modal.querySelector('#fullscreen-json-viewer .json-content') as HTMLElement;
      if (content) {
        content.scrollTop = 0;
        // No toast notification
      }
    });

    const bottomBtn = modal.querySelector('#fs-bottom-btn') as HTMLButtonElement;
    bottomBtn?.addEventListener('click', () => {
      const content = modal.querySelector('#fullscreen-json-viewer .json-content') as HTMLElement;
      if (content) {
        content.scrollTop = content.scrollHeight;
        // No toast notification
      }
    });

    const askAiBtn = modal.querySelector('#fs-ask-ai-btn') as HTMLButtonElement;
    askAiBtn?.addEventListener('click', () => {
      if (!jsonString) {
        // Silently return without toast notification
        return;
      }

      const response = {
        body: jsonString,
        headers: {},
        status: 200,
        statusText: 'OK',
        size: jsonString.length,
        time: 0,
        contentType: 'application/json',
        timestamp: Date.now()
      };

      const askAIEvent = new CustomEvent('open-ask-ai', {
        detail: { response: response }
      });
      document.dispatchEvent(askAIEvent);
      
      // Close modal without toast notification
      document.body.removeChild(modal);
      // No toast notification
    });

    const closeBtn = modal.querySelector('.close-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEscape);
      }
    });
  }

  private static showToast(message: string, type: string = 'info'): void {
    const toast = document.createElement('div');
    
    let backgroundColor = 'var(--primary-color, #007bff)';
    if (type === 'success') backgroundColor = 'var(--success-color, #28a745)';
    if (type === 'warning') backgroundColor = 'var(--warning-color, #ffc107)';
    if (type === 'error') backgroundColor = 'var(--error-color, #dc3545)';
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${backgroundColor};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10001;
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

  public static scrollToMatch(container: HTMLElement, match: any): void {
    const nodeElements = container.querySelectorAll('.json-node');
    let targetElement: HTMLElement | null = null;

    nodeElements.forEach((element) => {
      if (element.getAttribute('data-node-id') === match.node.lineNumber.toString()) {
        targetElement = element as HTMLElement;
      }
    });

    if (targetElement) {
      // Find the .json-content scrollable container
      const jsonViewer = container.closest('.json-viewer');
      const jsonContent = jsonViewer?.querySelector('.json-content') as HTMLElement;

      if (jsonContent) {
        // Store parent scroll positions to prevent them from scrolling
        const responsePanel = document.querySelector('.response-panel') as HTMLElement;
        const responsePanelScrollTop = responsePanel?.scrollTop || 0;

        // Calculate the position to scroll to within the json-content container only
        const targetRect = targetElement.getBoundingClientRect();
        const containerRect = jsonContent.getBoundingClientRect();
        const currentScrollTop = jsonContent.scrollTop;

        // Calculate the target's position relative to the container's current scroll position
        const targetOffsetFromTop = (targetRect.top - containerRect.top) + currentScrollTop;

        // Center the target in the json-content viewport
        const scrollTop = targetOffsetFromTop - (jsonContent.clientHeight / 2) + (targetElement.clientHeight / 2);

        jsonContent.scrollTo({
          top: Math.max(0, scrollTop),
          behavior: 'smooth'
        });

        // Restore parent scroll positions after a brief delay to prevent parent scroll
        if (responsePanel) {
          requestAnimationFrame(() => {
            responsePanel.scrollTop = responsePanelScrollTop;
          });
        }
      } else {
        // Fallback: Find the json-content from the container itself
        const fallbackContent = container.querySelector('.json-content') as HTMLElement;
        if (fallbackContent) {
          const targetRect = targetElement.getBoundingClientRect();
          const containerRect = fallbackContent.getBoundingClientRect();
          const currentScrollTop = fallbackContent.scrollTop;
          const targetOffsetFromTop = (targetRect.top - containerRect.top) + currentScrollTop;
          const scrollTop = targetOffsetFromTop - (fallbackContent.clientHeight / 2) + (targetElement.clientHeight / 2);
          
          fallbackContent.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
          });
        }
      }
    }
  }

  public static updateSearchResults(container: HTMLElement, searchInfo: { total: number, current: number }): void {
    const resultsSpan = container.querySelector('.search-results') as HTMLElement;
    if (resultsSpan) {
      resultsSpan.textContent = `${searchInfo.current}/${searchInfo.total}`;
    }
  }
}
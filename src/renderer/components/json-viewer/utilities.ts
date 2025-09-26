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
          <button class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div id="fullscreen-json-viewer"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const fullscreenViewer = new JsonViewer('fullscreen-json-viewer');
    fullscreenViewer.setData(jsonData);

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

  public static scrollToMatch(container: HTMLElement, match: any): void {
    const nodeElements = container.querySelectorAll('.json-node');
    let targetElement: HTMLElement | null = null;

    nodeElements.forEach((element) => {
      if (element.getAttribute('data-node-id') === match.node.lineNumber.toString()) {
        targetElement = element as HTMLElement;
      }
    });

    if (targetElement) {
      (targetElement as any).scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  public static updateSearchResults(container: HTMLElement, searchInfo: { total: number, current: number }): void {
    const resultsSpan = container.querySelector('.search-results') as HTMLElement;
    if (resultsSpan) {
      resultsSpan.textContent = `${searchInfo.current}/${searchInfo.total}`;
    }
  }
}
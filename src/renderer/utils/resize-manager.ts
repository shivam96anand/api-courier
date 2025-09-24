export class ResizeManager {
  private isResizing = false;
  private currentHandle: HTMLElement | null = null;
  private startX = 0;
  private startWidth = 0;

  initialize(): void {
    this.setupResizeHandles();
  }

  private setupResizeHandles(): void {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        this.startResize(e as MouseEvent, handle as HTMLElement);
      });
    });

    document.addEventListener('mousemove', (e) => {
      this.doResize(e);
    });

    document.addEventListener('mouseup', () => {
      this.stopResize();
    });
  }

  private startResize(e: MouseEvent, handle: HTMLElement): void {
    e.preventDefault();
    this.isResizing = true;
    this.currentHandle = handle;
    this.startX = e.clientX;

    const panel = handle.closest('.collections-panel, .request-panel, .json-input-panel') as HTMLElement;
    if (panel) {
      this.startWidth = panel.offsetWidth;
    }

    handle.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private doResize(e: MouseEvent): void {
    if (!this.isResizing || !this.currentHandle) return;

    const deltaX = e.clientX - this.startX;
    const newWidth = this.startWidth + deltaX;

    const panel = this.currentHandle.closest('.collections-panel, .request-panel, .json-input-panel') as HTMLElement;
    if (!panel) return;

    const panelType = this.currentHandle.dataset.panel;

    if (panelType === 'collections') {
      const minWidth = 200;
      const maxWidth = 400;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      panel.style.width = clampedWidth + 'px';
    } else if (panelType === 'request') {
      const minWidth = 300;
      const maxWidth = window.innerWidth - 200 - 300; // Leave space for collections and response
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      panel.style.width = clampedWidth + 'px';
      panel.style.flex = 'none'; // Override flex when manually resized
    } else if (panelType === 'json-input') {
      const minWidth = 250;
      const maxWidth = window.innerWidth - 300; // Leave minimum space for viewer panel
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      panel.style.width = clampedWidth + 'px';
      panel.style.flex = 'none'; // Override flex when manually resized

      // Update the viewer panel to take remaining space
      const viewerPanel = panel.parentElement?.querySelector('.json-viewer-panel') as HTMLElement;
      if (viewerPanel) {
        viewerPanel.style.width = `calc(100% - ${clampedWidth}px)`;
        viewerPanel.style.flex = 'none';
      }
    }
  }

  private stopResize(): void {
    if (!this.isResizing) return;

    this.isResizing = false;

    if (this.currentHandle) {
      this.currentHandle.classList.remove('resizing');
      this.currentHandle = null;
    }

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
}

export const resizeManager = new ResizeManager();
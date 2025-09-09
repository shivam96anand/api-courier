import { EventBus } from '../utils/event-bus';

export class UIManager {
  constructor(private eventBus: EventBus) {}

  initialize(): void {
    this.setupTabNavigation();
    this.setupWindowControls();
    this.setupResizableWindows();
  }

  private setupTabNavigation(): void {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update active tab content
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-tab`) {
            content.classList.add('active');
          }
        });
        
        this.eventBus.emit('tab:changed', tabId);
      });
    });

    // Setup request tabs
    this.setupRequestTabs();
    this.setupResponseTabs();
  }

  private setupRequestTabs(): void {
    const requestTabs = document.querySelectorAll('.request-tab');
    const requestPanes = document.querySelectorAll('.request-tab-pane');

    requestTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        
        requestTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        requestPanes.forEach(pane => {
          pane.classList.remove('active');
          if (pane.id === `${tabId}-tab`) {
            pane.classList.add('active');
          }
        });
      });
    });
  }

  private setupResponseTabs(): void {
    const responseTabs = document.querySelectorAll('.response-tab');
    const responsePanes = document.querySelectorAll('.response-tab-pane');

    responseTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        
        responseTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        responsePanes.forEach(pane => {
          pane.classList.remove('active');
          if (pane.id === `${tabId}-tab`) {
            pane.classList.add('active');
          }
        });
      });
    });
  }

  private setupWindowControls(): void {
    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        window.electronAPI.maximizeWindow();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
      });
    }
  }

  private setupResizableWindows(): void {
    const resizeHandles = document.querySelectorAll('.resize-handle');
    
    resizeHandles.forEach(handle => {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;
      let panel: HTMLElement | null = null;

      handle.addEventListener('mousedown', (e) => {
        const mouseEvent = e as MouseEvent;
        isResizing = true;
        startX = mouseEvent.clientX;
        
        const resizeType = handle.getAttribute('data-resize');
        if (resizeType === 'collections') {
          panel = document.querySelector('.collections-panel') as HTMLElement;
        } else if (resizeType === 'response') {
          panel = document.querySelector('.response-panel') as HTMLElement;
        }
        
        if (panel) {
          startWidth = parseInt(window.getComputedStyle(panel).width, 10);
        }
        
        document.body.style.cursor = 'col-resize';
        mouseEvent.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        const mouseEvent = e as MouseEvent;
        if (!isResizing || !panel) return;
        
        const diff = mouseEvent.clientX - startX;
        const resizeType = handle.getAttribute('data-resize');
        
        if (resizeType === 'collections') {
          const newWidth = startWidth + diff;
          panel.style.width = `${Math.max(200, Math.min(500, newWidth))}px`;
        } else if (resizeType === 'response') {
          // For response panel (right side), dragging right should shrink it (negative diff)
          const newWidth = startWidth - diff;
          panel.style.width = `${Math.max(300, Math.min(600, newWidth))}px`;
        }
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.cursor = '';
          
          // Save panel widths to settings
          if (panel) {
            const resizeType = handle.getAttribute('data-resize');
            const width = parseInt(panel.style.width, 10);
            
            if (resizeType === 'collections') {
              window.electronAPI.saveSettings({ sidebarWidth: width });
            } else if (resizeType === 'response') {
              window.electronAPI.saveSettings({ requestPanelWidth: width });
            }
          }
        }
      });
    });
  }

  showToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: var(--${type});
      color: white;
      border-radius: 4px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
}

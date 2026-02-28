import { ApiResponse } from '../../shared/types';
import { ResponseState, ResponseManagerConfig } from '../types/response-types';
import { ResponseViewer } from './response-viewer/ResponseViewer';
import { ResponseTabs } from './response-viewer/ResponseTabs';
import { ResponseActions } from './response-viewer/ResponseActions';

export class ResponseManager {
  private viewer!: ResponseViewer;
  private tabs!: ResponseTabs;
  private actions!: ResponseActions;
  private state: ResponseState;
  private container: HTMLElement;
  private loadingElement: HTMLElement | null = null;
  private loadingElements: HTMLElement[] = [];
  private loadingTimers: HTMLElement[] = [];
  private loadingStartTime: number = 0;
  private loadingTimerInterval: number | null = null;
  private currentRequestId: string = 'default';
  private pendingRequests: Map<string, number> = new Map();
  private activeTabRequestId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = {
      currentResponse: null,
      activeTab: 'body',
      searchQuery: '',
      viewPreferences: {},
      isFloatingSearchVisible: false
    };

    this.initializeComponents();
  }

  private initializeComponents(): void {
    const config: ResponseManagerConfig = {
      viewerConfig: {
        prettyConfig: {},
        rawConfig: { wrapLines: true, fontSize: 12 },
        headersConfig: { showSize: true, groupByType: false }
      },
      tabsConfig: {
        defaultTab: 'body',
        enabledTabs: ['body', 'headers', 'meta']
      },
      exportConfig: {
        defaultFormat: 'json',
        enabledFormats: ['json', 'text', 'csv']
      },
      searchConfig: {
        caseSensitive: false,
        regex: false
      }
    };

    this.viewer = new ResponseViewer(this.container, config.viewerConfig);
    this.tabs = new ResponseTabs(this.container, config.tabsConfig);
    this.actions = new ResponseActions(this.container);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.tabs.onTabChange((tab) => this.handleTabChange(tab));

    this.actions.onCopy(() => this.copyJsonResponse());
    this.actions.onExport(() => this.exportJsonResponse());
    this.actions.onFullscreen(() => this.toggleFullscreen());
    this.actions.onSearch(() => this.triggerMonacoSearch());
    this.actions.onCollapse(() => this.collapseAll());
    this.actions.onExpand(() => this.expandAll());
    this.actions.onScrollTop(() => this.scrollToTop());
    this.actions.onScrollBottom(() => this.scrollToBottom());
    this.actions.onAskAi(() => this.handleAskAI());

    this.listenToResponses();
    this.listenToTabChanges();
    this.listenForSearchTrigger();
    this.listenForViewerModeChanges();
  }

  initialize(): void {
    // Backward compatibility - components are initialized in constructor now
  }

  private handleTabChange(tab: string): void {
    this.state.activeTab = tab;
    this.viewer.switchTab(tab);
    this.actions.updateVisibility(this.state.currentResponse, tab, this.viewer.isJsonBody());
  }

  private listenToResponses(): void {
    document.addEventListener('request-sending', (e: Event) => {
      const customEvent = e as CustomEvent;
      const startTime = customEvent.detail.timestamp;
      const requestId = customEvent.detail.requestId;

      // Always track pending requests for tab-switch awareness
      if (requestId) {
        this.pendingRequests.set(requestId, startTime);
      }

      // Only show loading UI if this is the active tab's request
      if (requestId && requestId === this.activeTabRequestId) {
        this.showLoadingState(startTime);
      }
    });

    document.addEventListener('response-received', async (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      const requestId = customEvent.detail.request?.id;

      // Always remove from pending
      if (requestId) {
        this.pendingRequests.delete(requestId);
      }

      // Only display if this response belongs to the currently active tab
      if (requestId && requestId === this.activeTabRequestId) {
        this.hideLoadingState();
        await this.displayResponse(response);
      }
    });

    document.addEventListener('request-failed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail.requestId;

      if (requestId) {
        this.pendingRequests.delete(requestId);
      }

      if (requestId && requestId === this.activeTabRequestId) {
        this.hideLoadingState();
        this.state.currentResponse = null;
        this.viewer.clear();
        this.actions.hide();
      }
    });

    document.addEventListener('request-cancelled', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail.requestId;

      if (requestId) {
        this.pendingRequests.delete(requestId);
      }

      if (requestId && requestId === this.activeTabRequestId) {
        this.handleRequestCancelled();
      }
    });
  }

  private listenToTabChanges(): void {
    document.addEventListener('tab-changed', async (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;

      if (activeTab) {
        this.activeTabRequestId = activeTab.request?.id || null;
        this.currentRequestId = activeTab.id || 'default';

        // Check if this tab has a pending request (still loading)
        if (this.activeTabRequestId && this.pendingRequests.has(this.activeTabRequestId)) {
          const startTime = this.pendingRequests.get(this.activeTabRequestId)!;
          this.showLoadingState(startTime);
        } else if (activeTab.response) {
          // Tab has a response — display it
          this.hideLoadingState();
          await this.displayResponse(activeTab.response);
        } else {
          // No pending request, no response — clear
          this.clearResponse();
        }
      } else {
        this.activeTabRequestId = null;
        this.currentRequestId = 'default';
        this.clearResponse();
      }
    });
  }

  private listenForSearchTrigger(): void {
    document.addEventListener('trigger-response-search', () => {
      if (this.state.currentResponse) {
        this.triggerMonacoSearch();
      }
    });
  }

  private listenForViewerModeChanges(): void {
    document.addEventListener('response-viewer-mode-changed', () => {
      this.actions.updateVisibility(
        this.state.currentResponse,
        this.state.activeTab,
        this.viewer.isJsonBody()
      );
    });
  }

  private async displayResponse(response: ApiResponse): Promise<void> {
    this.state.currentResponse = response;
    this.viewer.setRequestId(this.currentRequestId);
    await this.viewer.displayResponse(response);
    this.tabs.updateTabs(response);
    this.actions.updateVisibility(response, this.state.activeTab, this.viewer.isJsonBody());
  }

  getCurrentResponse(): ApiResponse | null {
    return this.state.currentResponse;
  }

  clearResponse(): void {
    this.state.currentResponse = null;
    this.viewer.clear();
    this.actions.hide();
    this.hideLoadingState();
  }

  private showLoadingState(startTime: number): void {
    this.loadingStartTime = startTime;
    this.hideLoadingState();

    // Hide any existing response
    this.viewer.clear();
    this.actions.hide();

    ['response-body', 'response-headers'].forEach((sectionId) => {
      const section = this.container.querySelector(`#${sectionId}`);
      if (!section) {
        console.error(`${sectionId} element not found - spinner cannot be displayed`);
        return;
      }

      const { wrapper, timer } = this.createLoadingOverlay();
      section.innerHTML = '';
      section.appendChild(wrapper);
      this.loadingElements.push(wrapper);
      this.loadingTimers.push(timer);
    });

    this.loadingElement = this.loadingElements[0] || null;

    // Start timer
    this.loadingTimerInterval = window.setInterval(() => {
      const elapsed = (Date.now() - this.loadingStartTime) / 1000;
      this.loadingTimers.forEach((timer) => {
        timer.textContent = `${elapsed.toFixed(1)}s`;
      });
    }, 100);

    this.ensureSpinnerAnimation();
  }

  private createLoadingOverlay(): { wrapper: HTMLElement; timer: HTMLElement } {
    const wrapper = document.createElement('div');
    wrapper.className = 'response-loading-overlay';
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
      color: var(--text-secondary);
      font-size: 14px;
    `;

    const spinner = document.createElement('div');
    spinner.className = 'response-loading-spinner';
    spinner.style.cssText = `
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-color);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    `;

    const statusText = document.createElement('div');
    statusText.textContent = 'Sending request...';
    statusText.style.cssText = `
      font-size: 14px;
      color: var(--text-primary);
      margin-bottom: 8px;
      font-weight: 500;
    `;

    const timer = document.createElement('div');
    timer.className = 'request-timer';
    timer.textContent = '0.0s';
    timer.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-btn visible';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginTop = '12px';
    cancelBtn.style.paddingLeft = '18px';
    cancelBtn.style.paddingRight = '18px';
    cancelBtn.addEventListener('click', () => {
      cancelBtn.textContent = 'Cancelling...';
      cancelBtn.disabled = true;
      const cancelEvent = new CustomEvent('request-cancel-trigger');
      document.dispatchEvent(cancelEvent);
    });

    wrapper.appendChild(spinner);
    wrapper.appendChild(statusText);
    wrapper.appendChild(timer);
    wrapper.appendChild(cancelBtn);

    return { wrapper, timer };
  }

  private ensureSpinnerAnimation(): void {
    if (document.getElementById('loading-spinner-style')) return;

    const style = document.createElement('style');
    style.id = 'loading-spinner-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  private hideLoadingState(): void {
    if (this.loadingTimerInterval) {
      clearInterval(this.loadingTimerInterval);
      this.loadingTimerInterval = null;
    }

    if (this.loadingElement && this.loadingElement.parentNode) {
      this.loadingElement.remove();
      this.loadingElement = null;
    }

    this.loadingElements.forEach((el) => el.remove());
    this.loadingElements = [];
    this.loadingTimers = [];
  }

  private handleRequestCancelled(): void {
    this.hideLoadingState();
    this.state.currentResponse = null;
    this.viewer.clear();
    this.actions.hide();
  }

  // Action button implementations
  private toggleFullscreen(): void {
    this.viewer.openFullscreen();
  }

  private copyJsonResponse(): void {
    if (!this.state.currentResponse || !this.state.currentResponse.body) return;

    try {
      let textToCopy = this.state.currentResponse.body;

      // Reuse parsed JSON from viewer when available to avoid expensive re-parsing.
      const parsed = this.viewer.getParsedJson();
      if (parsed !== null && parsed !== undefined) {
        textToCopy = JSON.stringify(parsed, null, 2);
      }

      navigator.clipboard.writeText(textToCopy).then(() => {
        this.showToast('Response copied to clipboard');
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        this.showToast('Response copied to clipboard');
      });
    } catch (error) {
      this.showToast('Failed to copy response');
    }
  }

  private exportJsonResponse(): void {
    if (!this.state.currentResponse || !this.isJsonResponse()) {
      this.showToast('No JSON response to export');
      return;
    }

    this.viewer.exportJson();
  }

  private triggerMonacoSearch(): void {
    this.viewer.triggerMonacoSearch();
  }

  private collapseAll(): void {
    this.viewer.collapseAll();
  }

  private expandAll(): void {
    this.viewer.expandAll();
  }

  private scrollToTop(): void {
    this.viewer.scrollToTop();
  }

  private scrollToBottom(): void {
    this.viewer.scrollToBottom();
  }

  private handleAskAI(): void {
    if (!this.state.currentResponse) {
      this.showToast('No response to analyze');
      return;
    }

    // Get current active tab to access request data
    const event = new CustomEvent('get-active-tab-data');
    document.dispatchEvent(event);

    // We'll get the response via a custom event since we need to access TabsManager
    const askAiEvent = new CustomEvent('open-ask-ai', {
      detail: {
        response: this.state.currentResponse
      }
    });
    document.dispatchEvent(askAiEvent);
  }

  private isJsonResponse(): boolean {
    if (!this.state.currentResponse) return false;
    return this.viewer.isJsonBody();
  }

  private showToast(message: string): void {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: var(--primary-color);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      font-size: 12px;
      animation: slideInFromTop 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }
}

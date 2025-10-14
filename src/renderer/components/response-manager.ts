import { ApiResponse } from '../../shared/types';
import { ResponseState, ResponseManagerConfig } from '../types/response-types';
import { ResponseViewer } from './response-viewer/ResponseViewer';
import { ResponseTabs } from './response-viewer/ResponseTabs';
import { ResponseSearch } from './response-viewer/ResponseSearch';
import { ResponseActions } from './response-viewer/ResponseActions';

export class ResponseManager {
  private viewer!: ResponseViewer;
  private tabs!: ResponseTabs;
  private search!: ResponseSearch;
  private actions!: ResponseActions;
  private state: ResponseState;
  private container: HTMLElement;

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
    this.search = new ResponseSearch(this.container, config.searchConfig);
    this.actions = new ResponseActions(this.container);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.tabs.onTabChange((tab) => this.handleTabChange(tab));
    this.search.onSearchChange((query) => this.handleSearchChange(query));
    this.search.onNavigate((direction) => this.handleSearchNavigate(direction));
    
    this.actions.onCopy(() => this.copyJsonResponse());
    this.actions.onFullscreen(() => this.toggleFullscreen());
    this.actions.onSearch(() => this.toggleFloatingSearch());
    this.actions.onCollapse(() => this.collapseAll());
    this.actions.onExpand(() => this.expandAll());
    this.actions.onScrollTop(() => this.scrollToTop());
    this.actions.onScrollBottom(() => this.scrollToBottom());
    this.actions.onAskAi(() => this.handleAskAI());

    this.listenToResponses();
    this.listenToTabChanges();
  }

  initialize(): void {
    // Backward compatibility - components are initialized in constructor now
  }

  private handleTabChange(tab: string): void {
    this.state.activeTab = tab;
    this.viewer.switchTab(tab);
    this.actions.updateVisibility(this.state.currentResponse, tab);
    
    // Hide search if switching away from body
    if (tab !== 'body') {
      this.search.hide();
    }
  }

  private handleSearchChange(query: string): void {
    this.state.searchQuery = query;
    this.viewer.search(query);
    this.updateFloatingSearchResults();
  }

  private handleSearchNavigate(direction: number): void {
    // Navigation is handled by the viewer's search functionality
    // This could be enhanced to provide feedback
    this.updateFloatingSearchResults();
  }

  private listenToResponses(): void {
    document.addEventListener('response-received', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      this.displayResponse(response);
    });
  }

  private listenToTabChanges(): void {
    document.addEventListener('tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeTab = customEvent.detail.activeTab;

      if (activeTab && activeTab.response) {
        this.displayResponse(activeTab.response);
      } else {
        this.clearResponse();
      }
    });
  }

  private displayResponse(response: ApiResponse): void {
    this.state.currentResponse = response;
    this.viewer.displayResponse(response);
    this.tabs.updateTabs(response);
    this.actions.updateVisibility(response, this.state.activeTab);
  }

  getCurrentResponse(): ApiResponse | null {
    return this.state.currentResponse;
  }

  clearResponse(): void {
    this.state.currentResponse = null;
    this.viewer.clear();
    this.actions.hide();
    this.search.hide();
  }

  // Action button implementations
  private toggleFullscreen(): void {
    this.viewer.openFullscreen();
  }

  private copyJsonResponse(): void {
    if (!this.state.currentResponse || !this.state.currentResponse.body) return;

    try {
      let textToCopy = this.state.currentResponse.body;

      // If it's JSON, format it nicely
      if (this.isJsonResponse()) {
        const parsed = JSON.parse(this.state.currentResponse.body);
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

  private toggleFloatingSearch(): void {
    this.search.toggle();
  }

  private updateFloatingSearchResults(): void {
    // This could be enhanced to get actual search results from the viewer
    this.search.updateResults(0, 0, -1);
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
    const contentType = this.state.currentResponse.headers['content-type'] || '';
    return contentType.includes('application/json') || this.isValidJSON(this.state.currentResponse.body || '');
  }

  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
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
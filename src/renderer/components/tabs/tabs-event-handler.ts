import { ApiRequest, RequestMode, RequestTab } from '../../../shared/types';
import { iconHtml } from '../../utils/icons';

export class TabsEventHandler {
  private onCreateNewTab: () => void;
  private onSwitchToTab: (tabId: string) => void;
  private onCloseTab: (tabId: string) => void;
  private onShowTabContextMenu: (event: MouseEvent, tabId: string) => void;
  private onUpdateActiveTab: (updates: Partial<RequestTab>, markAsModified: boolean) => void;
  private onCloseTabsByRequestId: (requestId: string) => void;
  private onUpdateTabNameForRequest: (requestId: string, newName: string) => void;

  private onUpdateTabByRequestId: (requestId: string, updates: Partial<RequestTab>, markAsModified: boolean) => void;

  constructor(
    onCreateNewTab: () => void,
    onSwitchToTab: (tabId: string) => void,
    onCloseTab: (tabId: string) => void,
    onShowTabContextMenu: (event: MouseEvent, tabId: string) => void,
    onUpdateActiveTab: (updates: Partial<RequestTab>, markAsModified: boolean) => void,
    onCloseTabsByRequestId: (requestId: string) => void,
    onUpdateTabNameForRequest: (requestId: string, newName: string) => void,
    onUpdateTabByRequestId: (requestId: string, updates: Partial<RequestTab>, markAsModified: boolean) => void
  ) {
    this.onCreateNewTab = onCreateNewTab;
    this.onSwitchToTab = onSwitchToTab;
    this.onCloseTab = onCloseTab;
    this.onShowTabContextMenu = onShowTabContextMenu;
    this.onUpdateActiveTab = onUpdateActiveTab;
    this.onCloseTabsByRequestId = onCloseTabsByRequestId;
    this.onUpdateTabNameForRequest = onUpdateTabNameForRequest;
    this.onUpdateTabByRequestId = onUpdateTabByRequestId;
  }

  setupTabEvents(): void {
    const tabList = document.getElementById('request-tab-list');
    if (!tabList) return;

    tabList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.classList.contains('tab-close')) {
        const tabId = target.dataset.tabId;
        if (tabId) {
          this.onCloseTab(tabId);
        }
        return;
      }

      const tabElement = target.closest('.request-tab') as HTMLElement;
      if (tabElement) {
        const tabId = tabElement.dataset.tabId;

        if (tabId === 'new') {
          this.onCreateNewTab();
        } else if (tabId) {
          this.onSwitchToTab(tabId);
        }
      }
    });

    tabList.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const tabElement = target.closest('.request-tab') as HTMLElement;

      if (tabElement) {
        const tabId = tabElement.dataset.tabId;
        if (tabId && tabId !== 'new') {
          this.onShowTabContextMenu(e, tabId);
        }
      }
    });
  }

  setupEventListeners(): void {
    document.addEventListener('request-updated', (e: Event) => {
      const customEvent = e as CustomEvent;
      const updatedRequest = customEvent.detail.request;
      const requestMode = customEvent.detail.requestMode as RequestMode | undefined;
      if (updatedRequest) {
        const updates: Partial<RequestTab> = { request: updatedRequest };
        if (requestMode === 'soap') {
          updates.requestMode = 'soap';
          updates.soapDraft = this.cloneRequest(updatedRequest);
        } else if (requestMode === 'rest') {
          updates.requestMode = 'rest';
          updates.restDraft = this.cloneRequest(updatedRequest);
        }
        this.onUpdateActiveTab(updates, true);
      }
    });

    document.addEventListener('request-mode-switched', (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};
      const updates: Partial<RequestTab> = {};

      if (detail.request) {
        updates.request = detail.request as ApiRequest;
      }
      if (detail.requestMode) {
        updates.requestMode = detail.requestMode as RequestMode;
      }
      if (detail.restDraft) {
        updates.restDraft = detail.restDraft as ApiRequest;
      }
      if (detail.soapDraft) {
        updates.soapDraft = detail.soapDraft as ApiRequest;
      }
      if (detail.activeDetailsTab) {
        updates.activeDetailsTab = detail.activeDetailsTab as string;
      }

      if (Object.keys(updates).length > 0) {
        this.onUpdateActiveTab(updates, true);
      }
    });

    document.addEventListener('response-received', (e: Event) => {
      const customEvent = e as CustomEvent;
      const response = customEvent.detail.response;
      const request = customEvent.detail.request;
      if (response && request) {
        // Route response to the tab that owns this request, not the active tab
        this.onUpdateTabByRequestId(request.id, { response }, false);
      }
    });

    document.addEventListener('active-details-tab-changed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeDetailsTab = customEvent.detail.activeDetailsTab;
      if (activeDetailsTab) {
        this.onUpdateActiveTab({ activeDetailsTab }, false);
      }
    });

    document.addEventListener('request-deleted', (e: Event) => {
      const customEvent = e as CustomEvent;
      const requestId = customEvent.detail.requestId;
      if (requestId) {
        this.onCloseTabsByRequestId(requestId);
      }
    });

    document.addEventListener('collection-renamed', (e: Event) => {
      const customEvent = e as CustomEvent;
      const collection = customEvent.detail.collection;
      const newName = customEvent.detail.newName;

      if (collection && collection.type === 'request' && collection.request) {
        this.onUpdateTabNameForRequest(collection.request.id, newName);
      }
    });
  }

  showTabContextMenu(
    event: MouseEvent,
    tab: RequestTab,
    onDuplicateTab: (tabId: string) => void,
    onCopyRequestUrl: (tabId: string) => void,
    onCloseAllTabs: () => void,
    onCloseOtherTabs: (keepTabId: string) => void
  ): void {
    // Remove any existing context menus
    const existingMenus = document.querySelectorAll('.context-menu, .tab-context-menu');
    existingMenus.forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';
    menu.style.visibility = 'hidden';

    const menuOptions = [
      {
        label: 'Duplicate Tab',
        icon: 'duplicate',
        action: () => onDuplicateTab(tab.id),
        destructive: false
      },
      {
        label: 'Copy Request URL',
        icon: 'clipboard',
        action: () => onCopyRequestUrl(tab.id),
        destructive: false
      },
      {
        label: '---',
        action: null,
        destructive: false
      },
      {
        label: 'Close Tab',
        icon: 'close',
        action: () => this.onCloseTab(tab.id),
        destructive: false
      },
      {
        label: 'Close All Tabs',
        icon: 'trash',
        action: () => onCloseAllTabs(),
        destructive: true
      },
      {
        label: 'Close Other Tabs',
        icon: 'layers',
        action: () => onCloseOtherTabs(tab.id),
        destructive: false
      }
    ];

    menuOptions.forEach(option => {
      const item = document.createElement('div');

      if (option.label === '---') {
        item.className = 'context-menu-separator';
      } else {
        item.className = 'context-menu-item';
        if (option.destructive) {
          item.classList.add('destructive');
        }

        if (option.icon) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'context-menu-icon';
          iconSpan.innerHTML = iconHtml(option.icon);
          item.appendChild(iconSpan);
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'context-menu-label';
        labelSpan.textContent = option.label;
        item.appendChild(labelSpan);

        if (option.action) {
          item.addEventListener('click', () => {
            option.action!();
            if (document.body.contains(menu)) {
              document.body.removeChild(menu);
            }
          });
        }
      }

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Position menu with boundary detection
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY;

    if (left + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 8;
    }
    if (top + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 8;
    }
    left = Math.max(8, left);
    top = Math.max(8, top);

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';

    const handleClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);
  }

  showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--success-color)' : 'var(--error-color)'};
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  private cloneRequest(request: ApiRequest): ApiRequest {
    return {
      ...request,
      params: Array.isArray(request.params)
        ? request.params.map((param) => ({ ...param }))
        : request.params
          ? { ...request.params }
          : request.params,
      headers: Array.isArray(request.headers)
        ? request.headers.map((header) => ({ ...header }))
        : { ...request.headers },
      body: request.body ? { ...request.body } : request.body,
      auth: request.auth ? { ...request.auth, config: { ...request.auth.config } } : request.auth,
      soap: request.soap ? { ...request.soap } : request.soap,
      variables: request.variables ? { ...request.variables } : request.variables,
    };
  }
}

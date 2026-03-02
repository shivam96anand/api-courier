export class AppManager {
  private activeTab = 'api';
  private navOrder: string[] = [];
  private draggingTab?: string;

  initialize(): void {
    this.setupNavTabs();
    this.setupFeedbackButton();
    this.setupKeyboardShortcuts();
    this.showTab(this.activeTab);
  }

  private setupNavTabs(): void {
    const navTabs = this.getNavTabs();
    this.navOrder = navTabs
      .map(tab => tab.dataset.tab)
      .filter((tab): tab is string => Boolean(tab));

    navTabs.forEach(tab => {
      tab.setAttribute('draggable', 'true');

      tab.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabName = target.dataset.tab;

        if (tabName) {
          this.switchToTab(tabName);
        }
      });

      tab.addEventListener('dragstart', (event) => this.handleDragStart(event, tab));
      tab.addEventListener('dragover', (event) => this.handleDragOver(event, tab));
      tab.addEventListener('dragleave', () => this.clearHoverClasses());
      tab.addEventListener('drop', (event) => this.handleDrop(event, tab));
      tab.addEventListener('dragend', () => this.clearDragClasses());
    });
  }

  private setupFeedbackButton(): void {
    const feedbackBtn = document.getElementById('feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        const url = 'https://forms.gle/knkLgwdyUzjRxuQt5';
        if (window.apiCourier?.system?.openExternal) {
          window.apiCourier.system.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      });
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux) + number key (1-9)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      if (!modifierKey) return;

      // Check if the pressed key is a number between 1-9
      const keyNumber = parseInt(e.key, 10);
      if (isNaN(keyNumber) || keyNumber < 1 || keyNumber > 9) return;

      // Get the tab at this position (keyNumber - 1 because arrays are 0-indexed)
      const tabIndex = keyNumber - 1;
      if (tabIndex >= this.navOrder.length) return;

      const targetTabName = this.navOrder[tabIndex];

      // If already on this tab, do nothing
      if (targetTabName === this.activeTab) return;

      // Prevent default behavior and switch to the tab
      e.preventDefault();
      this.switchToTab(targetTabName);
    });
  }

  private switchToTab(tabName: string): void {
    this.activeTab = tabName;

    // Update nav tab active state
    this.getNavTabs().forEach(tab => {
      tab.classList.remove('active');
    });

    const activeNavTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeNavTab) {
      activeNavTab.classList.add('active');
    }

    // Show appropriate tab content
    this.showTab(tabName);

    // Notify listeners so lazy managers can initialize on first view
    document.dispatchEvent(new CustomEvent('nav-tab-switched', { detail: { tab: tabName } }));
  }

  private showTab(tabName: string): void {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Show selected tab content
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
      targetTab.classList.add('active');
    }
  }

  getActiveTab(): string {
    return this.activeTab;
  }

  setNavOrder(order?: string[]): void {
    const navContainer = document.querySelector('.nav-tabs');
    if (!navContainer) return;

    if (!order || order.length === 0) {
      this.updateNavOrderFromDom();
      return;
    }

    const tabMap = new Map<string, HTMLElement>();
    this.getNavTabs().forEach(tab => {
      const name = tab.dataset.tab;
      if (name) {
        tabMap.set(name, tab);
      }
    });

    order.forEach(name => {
      const tab = tabMap.get(name);
      if (tab) {
        navContainer.appendChild(tab);
      }
    });

    tabMap.forEach((tab, name) => {
      if (!order.includes(name)) {
        navContainer.appendChild(tab);
      }
    });

    this.updateNavOrderFromDom();
  }

  getNavOrder(): string[] {
    return [...this.navOrder];
  }

  private handleDragStart(event: DragEvent, tab: HTMLElement): void {
    const tabName = tab.dataset.tab;
    if (!tabName || !event.dataTransfer) return;

    this.draggingTab = tabName;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabName);
    tab.classList.add('dragging');
  }

  private handleDragOver(event: DragEvent, tab: HTMLElement): void {
    if (!event.dataTransfer) return;

    event.preventDefault();
    if (tab.classList.contains('dragging')) return;

    this.clearHoverClasses();

    const bounds = tab.getBoundingClientRect();
    const isBefore = event.clientY - bounds.top < bounds.height / 2;
    tab.classList.add(isBefore ? 'drag-over-top' : 'drag-over-bottom');
    event.dataTransfer.dropEffect = 'move';
  }

  private handleDrop(event: DragEvent, targetTab: HTMLElement): void {
    event.preventDefault();
    const draggedTabName = event.dataTransfer?.getData('text/plain') || this.draggingTab;
    const targetTabName = targetTab.dataset.tab;

    if (!draggedTabName || !targetTabName || draggedTabName === targetTabName) {
      this.clearDragClasses();
      return;
    }

    const navContainer = targetTab.parentElement;
    const draggedTab = document.querySelector(`.nav-tab[data-tab="${draggedTabName}"]`) as HTMLElement | null;
    if (!navContainer || !draggedTab) {
      this.clearDragClasses();
      return;
    }

    const bounds = targetTab.getBoundingClientRect();
    const placeBefore = event.clientY - bounds.top < bounds.height / 2;

    if (placeBefore) {
      navContainer.insertBefore(draggedTab, targetTab);
    } else {
      navContainer.insertBefore(draggedTab, targetTab.nextElementSibling);
    }

    this.updateNavOrderFromDom();
    this.clearDragClasses();
    document.dispatchEvent(new CustomEvent('nav-order-changed', { detail: { order: this.navOrder } }));
  }

  private clearHoverClasses(): void {
    this.getNavTabs().forEach(tab => {
      tab.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }

  private clearDragClasses(): void {
    this.getNavTabs().forEach(tab => {
      tab.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
    this.draggingTab = undefined;
  }

  private updateNavOrderFromDom(): void {
    this.navOrder = this.getNavTabs()
      .map(tab => tab.dataset.tab)
      .filter((tab): tab is string => Boolean(tab));
  }

  private getNavTabs(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.nav-tab')) as HTMLElement[];
  }
}

import { RequestTab } from '../../../shared/types';

export class TabsRenderer {
  private dragSourceTabId: string | null = null;

  renderTabs(tabs: RequestTab[], activeTabId: string | undefined): void {
    const tabList = document.getElementById('request-tab-list');
    if (!tabList) return;

    tabList.innerHTML = '';

    const newTabButton = document.createElement('button');
    newTabButton.className = 'request-tab new-tab-button';
    newTabButton.dataset.tabId = 'new';
    newTabButton.textContent = '+ New Request';
    newTabButton.title = 'Create new request';
    tabList.appendChild(newTabButton);

    tabs.forEach((tab) => {
      const tabElement = document.createElement('button');
      tabElement.className = `request-tab ${tab.id === activeTabId ? 'active' : ''}`;
      tabElement.dataset.tabId = tab.id;
      tabElement.draggable = true;

      tabElement.addEventListener('dragstart', (e) => {
        this.dragSourceTabId = tab.id;
        tabElement.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', tab.id);
        }
      });

      tabElement.addEventListener('dragend', () => {
        this.dragSourceTabId = null;
        tabElement.classList.remove('dragging');
        tabList.querySelectorAll('.request-tab').forEach((el) => {
          el.classList.remove('drag-over-left', 'drag-over-right');
        });
      });

      tabElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!this.dragSourceTabId || this.dragSourceTabId === tab.id) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = tabElement.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        tabElement.classList.remove('drag-over-left', 'drag-over-right');
        if ((e as DragEvent).clientX < midX) {
          tabElement.classList.add('drag-over-left');
        } else {
          tabElement.classList.add('drag-over-right');
        }
      });

      tabElement.addEventListener('dragleave', () => {
        tabElement.classList.remove('drag-over-left', 'drag-over-right');
      });

      tabElement.addEventListener('drop', (e) => {
        e.preventDefault();
        tabElement.classList.remove('drag-over-left', 'drag-over-right');
        if (!this.dragSourceTabId || this.dragSourceTabId === tab.id) return;

        const rect = tabElement.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const dropBefore = (e as DragEvent).clientX < midX;

        document.dispatchEvent(
          new CustomEvent('tab-reorder', {
            detail: {
              sourceTabId: this.dragSourceTabId,
              targetTabId: tab.id,
              dropBefore,
            },
          })
        );
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = tab.name + (tab.isModified ? ' •' : '');
      nameSpan.className = 'tab-name';

      const closeButton = document.createElement('span');
      closeButton.className = 'tab-close';
      closeButton.dataset.tabId = tab.id;
      closeButton.textContent = '×';
      closeButton.title = 'Close tab';

      tabElement.appendChild(nameSpan);
      tabElement.appendChild(closeButton);
      tabList.appendChild(tabElement);
    });
  }
}

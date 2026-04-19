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
      nameSpan.title = 'Double-click to rename';

      // Inline rename on double-click. Replaces the span with a small input,
      // commits on Enter / blur, cancels on Escape. The actual update is
      // dispatched as a custom event so tabs-state-manager owns the mutation.
      nameSpan.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        if (nameSpan.querySelector('input')) return;
        const original = tab.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'tab-name__rename-input';
        input.setAttribute('aria-label', 'Rename tab');
        nameSpan.textContent = '';
        nameSpan.appendChild(input);
        input.focus();
        input.select();

        const commit = (next: string): void => {
          const trimmed = next.trim();
          if (trimmed && trimmed !== original) {
            document.dispatchEvent(
              new CustomEvent('tab-rename', {
                detail: { tabId: tab.id, newName: trimmed },
              })
            );
          } else {
            // restore display
            nameSpan.textContent = original + (tab.isModified ? ' •' : '');
          }
        };

        let committed = false;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            committed = true;
            commit(input.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            committed = true;
            nameSpan.textContent = original + (tab.isModified ? ' •' : '');
          }
        });
        input.addEventListener('blur', () => {
          if (!committed) commit(input.value);
        });
      });

      const closeButton = document.createElement('span');
      closeButton.className = 'tab-close';
      closeButton.dataset.tabId = tab.id;
      closeButton.textContent = '×';
      closeButton.title = 'Close tab';
      closeButton.setAttribute('role', 'button');
      closeButton.setAttribute(
        'aria-label',
        `Close tab ${tab.name || ''}`.trim()
      );
      closeButton.setAttribute('tabindex', '0');

      tabElement.appendChild(nameSpan);
      tabElement.appendChild(closeButton);
      tabList.appendChild(tabElement);
    });
  }
}

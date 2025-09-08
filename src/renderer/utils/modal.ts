export class Modal {
  private overlay!: HTMLElement;
  private modal!: HTMLElement;

  constructor() {
    this.createModal();
  }

  private createModal(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      z-index: 1000;
      backdrop-filter: blur(2px);
    `;

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'modal';
    this.modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      max-width: 600px;
      z-index: 1001;
      box-shadow: 0 10px 30px var(--shadow);
    `;

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  show(content: string): void {
    this.modal.innerHTML = content;
    this.overlay.style.display = 'block';
  }

  close(): void {
    this.overlay.style.display = 'none';
    this.modal.innerHTML = '';
  }

  isOpen(): boolean {
    return this.overlay.style.display === 'block';
  }

  static prompt(title: string, placeholder: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new Modal();
      const inputId = `input-${Date.now()}`;
      
      const content = `
        <div class="modal-header">
          <h3 style="margin-bottom: 16px; color: var(--text);">${title}</h3>
        </div>
        <div class="modal-body">
          <input 
            type="text" 
            id="${inputId}"
            placeholder="${placeholder}"
            style="
              width: 100%;
              padding: 12px;
              background: var(--surface);
              color: var(--text);
              border: 1px solid var(--border);
              border-radius: 4px;
              font-size: 14px;
              margin-bottom: 16px;
            "
          />
        </div>
        <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="cancel-btn" class="btn">Cancel</button>
          <button id="ok-btn" class="btn btn-primary">OK</button>
        </div>
      `;

      modal.show(content);

      const input = document.getElementById(inputId) as HTMLInputElement;
      const cancelBtn = document.getElementById('cancel-btn');
      const okBtn = document.getElementById('ok-btn');

      input.focus();

      const handleOk = () => {
        const value = input.value.trim();
        modal.close();
        resolve(value || null);
      };

      const handleCancel = () => {
        modal.close();
        resolve(null);
      };

      okBtn?.addEventListener('click', handleOk);
      cancelBtn?.addEventListener('click', handleCancel);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleOk();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      });
    });
  }

  static confirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal();
      
      const content = `
        <div class="modal-header">
          <h3 style="margin-bottom: 16px; color: var(--text);">${title}</h3>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">${message}</p>
        </div>
        <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="cancel-btn" class="btn">Cancel</button>
          <button id="confirm-btn" class="btn btn-primary">Confirm</button>
        </div>
      `;

      modal.show(content);

      const cancelBtn = document.getElementById('cancel-btn');
      const confirmBtn = document.getElementById('confirm-btn');

      const handleConfirm = () => {
        modal.close();
        resolve(true);
      };

      const handleCancel = () => {
        modal.close();
        resolve(false);
      };

      confirmBtn?.addEventListener('click', handleConfirm);
      cancelBtn?.addEventListener('click', handleCancel);
    });
  }

  static showMenu(x: number, y: number, items: Array<{label: string, action: () => void, icon?: string}>): void {
    // Remove existing menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${y}px;
      left: ${x}px;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      box-shadow: 0 4px 12px var(--shadow);
      z-index: 1002;
      min-width: 150px;
      padding: 4px 0;
    `;

    items.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background-color 0.2s;
      `;

      menuItem.innerHTML = `
        ${item.icon ? `<span style="font-size: 12px;">${item.icon}</span>` : ''}
        <span>${item.label}</span>
      `;

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = 'var(--surface)';
      });

      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });

      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });

      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // Position menu if it goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }

    // Remove menu on click outside
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 0);
  }
}

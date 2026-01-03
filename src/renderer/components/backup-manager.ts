interface BackupInfo {
  id: string;
  filename: string;
  createdAt: number;
}

export class BackupManager {
  private button: HTMLButtonElement | null = null;
  private menu: HTMLDivElement | null = null;

  initialize(): void {
    this.button = document.getElementById('backup-button') as HTMLButtonElement | null;
    if (!this.button) return;

    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.menu) {
        this.closeMenu();
      } else {
        this.openMenu();
      }
    });

    document.addEventListener('click', (event) => {
      if (!this.menu) return;
      if (this.menu.contains(event.target as Node)) return;
      if (this.button && this.button.contains(event.target as Node)) return;
      this.closeMenu();
    });
  }

  private async openMenu(): Promise<void> {
    if (!this.button) return;
    const backups = await this.fetchBackups();
    this.menu = this.buildMenu(backups);
    document.body.appendChild(this.menu);
    this.positionMenu();
  }

  private closeMenu(): void {
    if (this.menu && document.body.contains(this.menu)) {
      document.body.removeChild(this.menu);
    }
    this.menu = null;
  }

  private async fetchBackups(): Promise<BackupInfo[]> {
    try {
      return await window.apiCourier.backups.list();
    } catch (error) {
      console.error('Failed to load backups:', error);
      return [];
    }
  }

  private buildMenu(backups: BackupInfo[]): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'backup-menu';

    const title = document.createElement('div');
    title.className = 'backup-menu-title';
    title.textContent = 'Recent Backups';
    menu.appendChild(title);

    const list = document.createElement('div');
    list.className = 'backup-menu-list';

    if (backups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'backup-menu-empty';
      empty.textContent = 'No backups yet';
      list.appendChild(empty);
    } else {
      backups.forEach((backup) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'backup-menu-item';
        item.textContent = this.formatBackupLabel(backup);
        item.addEventListener('click', async () => {
          const ok = window.confirm(`Restore backup from ${this.formatBackupLabel(backup)}?`);
          if (!ok) return;
          try {
            await window.apiCourier.backups.restore(backup.id);
            window.location.reload();
          } catch (error) {
            console.error('Failed to restore backup:', error);
          }
        });
        list.appendChild(item);
      });
    }

    menu.appendChild(list);
    return menu;
  }

  private positionMenu(): void {
    if (!this.menu || !this.button) return;
    const rect = this.button.getBoundingClientRect();
    const menuRect = this.menu.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - menuRect.width - 12);
    const top = rect.bottom + 8;
    this.menu.style.left = `${Math.max(12, left)}px`;
    this.menu.style.top = `${top}px`;
  }

  private formatBackupLabel(backup: BackupInfo): string {
    if (!backup.createdAt) {
      return backup.filename;
    }
    const date = new Date(backup.createdAt);
    return date.toLocaleString();
  }
}

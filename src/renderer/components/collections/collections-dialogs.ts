import { Collection } from '../../../shared/types';
import { modal } from '../../utils/modal';

export class CollectionsDialogs {
  private onShowError: (message: string) => void;

  constructor(onShowError: (message: string) => void) {
    this.onShowError = onShowError;
  }

  async showCreateDialog(type: 'folder' | 'request' = 'folder', parentId?: string): Promise<Collection | null> {
    const name = await modal.show(`Create ${type}`, `Enter ${type} name`);
    if (!name) return null;

    try {
      let collectionData: any = {
        name,
        type,
        parentId,
      };

      if (type === 'request') {
        collectionData.request = {
          id: crypto.randomUUID(),
          name: name,
          method: 'GET',
          url: '',
          headers: {
            'User-Agent': 'Restbro/1.0',
            'Accept-Encoding': 'gzip'
          },
          params: {},
          body: {
            type: 'none',
            content: ''
          },
          auth: {
            type: 'none',
            config: {}
          }
        };
      }

      const newCollection = await window.apiCourier.collection.create(collectionData);
      return newCollection;
    } catch (error) {
      console.error('Failed to create collection:', error);
      this.onShowError('Failed to create collection');
      return null;
    }
  }

  async showRenameDialog(collection: Collection): Promise<string | null> {
    const newName = await modal.show('Rename', 'Enter new name', collection.name);
    if (!newName || newName === collection.name) return null;
    return newName;
  }

  async showConfirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 24px;
        min-width: 300px;
        max-width: 500px;
      `;

      const titleEl = document.createElement('h3');
      titleEl.textContent = title;
      titleEl.style.cssText = `
        margin: 0 0 8px 0;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 600;
      `;

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        margin: 0 0 20px 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.4;
      `;

      const buttonsContainer = document.createElement('div');
      buttonsContainer.style.cssText = `
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      `;

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.cssText = `
        padding: 8px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-primary);
        cursor: pointer;
        font-size: 14px;
      `;

      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Delete';
      confirmButton.style.cssText = `
        padding: 8px 16px;
        background: var(--error-color);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 14px;
      `;

      const cleanup = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };

      cancelButton.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmButton.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      buttonsContainer.appendChild(cancelButton);
      buttonsContainer.appendChild(confirmButton);
      content.appendChild(titleEl);
      content.appendChild(messageEl);
      content.appendChild(buttonsContainer);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    });
  }
}
import type { KeyValuePair } from '../../../../shared/types';

export class HeadersManager {
  private container: HTMLElement;
  private onUpdateCallback: ((headers: KeyValuePair[]) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const addHeaderBtn = this.container.querySelector('.add-header-btn');
    const headersEditor = this.container.querySelector('#headers-editor');

    if (addHeaderBtn && headersEditor) {
      addHeaderBtn.addEventListener('click', () => {
        this.addHeaderRow();
      });

      headersEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateHeadersFromDOM();
            // Add a new empty row if no rows left
            if (headersEditor.children.length === 0) {
              this.addHeaderRow();
            }
          }
        }
      });

      headersEditor.addEventListener('input', () => {
        this.updateHeadersFromDOM();
      });

      headersEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateHeadersFromDOM();
      });
    }
  }

  private addHeaderRow(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    headersEditor.appendChild(row);
  }

  private updateHeadersFromDOM(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const headers: KeyValuePair[] = [];
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (keyInput && valueInput && keyInput.value.trim()) {
        headers.push({
          key: keyInput.value.trim(),
          value: valueInput.value.trim(),
          enabled: checkbox ? checkbox.checked : true
        });
      }
    });

    this.onUpdateCallback?.(headers);
  }

  private updateRowVisualState(checkbox: HTMLInputElement): void {
    const row = checkbox.closest('.kv-row');
    if (row) {
      if (checkbox.checked) {
        row.classList.remove('disabled');
      } else {
        row.classList.add('disabled');
      }
    }
  }

  public loadHeaders(headers: KeyValuePair[] | Record<string, string> | undefined): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    headersEditor.innerHTML = '';

    // Convert old Record format to array format for backward compatibility
    let headersArray: KeyValuePair[];
    if (Array.isArray(headers)) {
      headersArray = headers;
    } else if (headers) {
      headersArray = Object.entries(headers).map(([key, value]) => ({
        key,
        value,
        enabled: true
      }));
    } else {
      headersArray = [];
    }

    headersArray.forEach(({ key, value, enabled }) => {
      const row = document.createElement('div');
      row.className = enabled ? 'kv-row' : 'kv-row disabled';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" ${enabled ? 'checked' : ''}>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }
  }

  public clear(): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (headersEditor) {
      headersEditor.innerHTML = '';
      this.addHeaderRow();
    }
  }

  public onUpdate(callback: (headers: KeyValuePair[]) => void): void {
    this.onUpdateCallback = callback;
  }

  public updateHeader(key: string, value: string): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    // Find existing header row or create new one
    let targetRow: Element | null = null;
    const rows = headersEditor.querySelectorAll('.kv-row');
    
    rows.forEach(row => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      if (keyInput && keyInput.value.toLowerCase() === key.toLowerCase()) {
        targetRow = row;
      }
    });

    if (targetRow) {
      const valueInput = (targetRow as Element).querySelector('.value-input') as HTMLInputElement;
      if (valueInput) {
        valueInput.value = value;
      }
    } else {
      // Create new row
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      headersEditor.appendChild(row);
    }

    this.updateHeadersFromDOM();
  }

  public removeHeader(key: string): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    const rows = Array.from(headersEditor.querySelectorAll('.kv-row'));
    const targetKey = key.toLowerCase();
    rows.forEach(row => {
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      if (keyInput && keyInput.value.toLowerCase() === targetKey) {
        row.remove();
      }
    });

    if (headersEditor.children.length === 0) {
      this.addHeaderRow();
    }

    this.updateHeadersFromDOM();
  }
}

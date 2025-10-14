export class HeadersManager {
  private container: HTMLElement;
  private onUpdateCallback: ((headers: Record<string, string>) => void) | null = null;

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

    const headers: Record<string, string> = {};
    const rows = headersEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (checkbox && checkbox.checked && keyInput && valueInput && keyInput.value.trim()) {
        headers[keyInput.value.trim()] = valueInput.value.trim();
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

  public loadHeaders(headers: Record<string, string>): void {
    const headersEditor = this.container.querySelector('#headers-editor');
    if (!headersEditor) return;

    headersEditor.innerHTML = '';

    Object.entries(headers).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
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

  public onUpdate(callback: (headers: Record<string, string>) => void): void {
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
}
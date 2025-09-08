export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export class KeyValueEditor {
  private pairs: KeyValuePair[] = [];
  private containerId: string;

  constructor(containerId: string, initialData: Record<string, string> = {}) {
    this.containerId = containerId;
    this.initializePairs(initialData);
  }

  private initializePairs(data: Record<string, string>): void {
    this.pairs = Object.entries(data).map(([key, value]) => ({
      id: this.generateId(),
      key,
      value,
      enabled: true
    }));

    // Always have one empty row
    if (this.pairs.length === 0) {
      this.addEmptyPair();
    }
  }

  private generateId(): string {
    return `kv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addEmptyPair(): void {
    this.pairs.push({
      id: this.generateId(),
      key: '',
      value: '',
      enabled: true
    });
  }

  render(): void {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="key-value-editor">
        <div class="key-value-header">
          <span></span>
          <span>Key</span>
          <span>Value</span>
          <span></span>
        </div>
        <div class="key-value-rows" id="${this.containerId}-rows"></div>
        <button class="add-row-btn" id="${this.containerId}-add">+ Add Row</button>
      </div>
    `;

    this.renderRows();
    this.attachEvents();
  }

  private renderRows(): void {
    const rowsContainer = document.getElementById(`${this.containerId}-rows`);
    if (!rowsContainer) return;

    rowsContainer.innerHTML = '';

    this.pairs.forEach((pair, index) => {
      const row = document.createElement('div');
      row.className = `key-value-row ${!pair.enabled ? 'disabled' : ''}`;
      row.innerHTML = `
        <div class="checkbox-wrapper">
          <input 
            type="checkbox" 
            ${pair.enabled ? 'checked' : ''} 
            data-id="${pair.id}"
            class="pair-enabled"
          />
        </div>
        <input 
          type="text" 
          placeholder="Key" 
          value="${pair.key}" 
          data-id="${pair.id}"
          class="pair-key ${!pair.enabled ? 'disabled' : ''}"
        />
        <input 
          type="text" 
          placeholder="Value" 
          value="${pair.value}" 
          data-id="${pair.id}"
          class="pair-value ${!pair.enabled ? 'disabled' : ''}"
        />
        <button class="delete-btn" data-id="${pair.id}" title="Delete">
          <span>×</span>
        </button>
      `;

      rowsContainer.appendChild(row);
    });

    // Ensure we always have one empty row at the end
    if (this.pairs.length === 0 || this.pairs[this.pairs.length - 1].key !== '' || this.pairs[this.pairs.length - 1].value !== '') {
      this.addEmptyPair();
      this.renderRows();
    }
  }

  private attachEvents(): void {
    const rowsContainer = document.getElementById(`${this.containerId}-rows`);
    const addBtn = document.getElementById(`${this.containerId}-add`);

    if (!rowsContainer) return;

    // Add row button
    addBtn?.addEventListener('click', () => {
      this.addEmptyPair();
      this.renderRows();
    });

    // Event delegation for row inputs and buttons
    rowsContainer.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const id = target.getAttribute('data-id');
      if (!id) return;

      const pair = this.pairs.find(p => p.id === id);
      if (!pair) return;

      if (target.classList.contains('pair-key')) {
        pair.key = target.value;
      } else if (target.classList.contains('pair-value')) {
        pair.value = target.value;
      }

      this.onChange();
    });

    rowsContainer.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const id = target.getAttribute('data-id');
      if (!id) return;

      const pair = this.pairs.find(p => p.id === id);
      if (!pair) return;

      if (target.classList.contains('pair-enabled')) {
        pair.enabled = target.checked;
        this.renderRows(); // Re-render to apply disabled styles
        this.onChange();
      }
    });

    rowsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('delete-btn') || target.parentElement?.classList.contains('delete-btn')) {
        const btn = target.classList.contains('delete-btn') ? target : target.parentElement;
        const id = btn?.getAttribute('data-id');
        if (id) {
          this.deletePair(id);
        }
      }
    });
  }

  private deletePair(id: string): void {
    this.pairs = this.pairs.filter(p => p.id !== id);
    this.renderRows();
    this.onChange();
  }

  getData(): Record<string, string> {
    const result: Record<string, string> = {};
    
    this.pairs.forEach(pair => {
      if (pair.enabled && pair.key.trim() !== '') {
        result[pair.key] = pair.value;
      }
    });

    return result;
  }

  getEnabledPairs(): KeyValuePair[] {
    return this.pairs.filter(pair => pair.enabled && pair.key.trim() !== '');
  }

  getAllPairs(): KeyValuePair[] {
    return [...this.pairs];
  }

  setData(data: Record<string, string>): void {
    this.initializePairs(data);
    this.renderRows();
  }

  clear(): void {
    this.pairs = [];
    this.addEmptyPair();
    this.renderRows();
    this.onChange();
  }

  private onChange(): void {
    // Emit custom event for parent components to listen to
    const event = new CustomEvent('keyvalue-change', {
      detail: {
        data: this.getData(),
        pairs: this.getEnabledPairs()
      }
    });
    document.dispatchEvent(event);
  }
}

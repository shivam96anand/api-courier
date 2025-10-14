export class ParamsManager {
  private container: HTMLElement;
  private onUpdateCallback: ((params: Record<string, string>) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const addParamBtn = this.container.querySelector('.add-param-btn');
    const paramsEditor = this.container.querySelector('#params-editor');

    if (addParamBtn && paramsEditor) {
      addParamBtn.addEventListener('click', () => {
        this.addParamRow();
      });

      paramsEditor.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-btn')) {
          const row = target.closest('.kv-row');
          if (row) {
            row.remove();
            this.updateParamsFromDOM();
            // Add a new empty row if no rows left
            if (paramsEditor.children.length === 0) {
              this.addParamRow();
            }
          }
        }
      });

      paramsEditor.addEventListener('input', () => {
        this.updateParamsFromDOM();
      });

      paramsEditor.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).classList.contains('kv-checkbox')) {
          this.updateRowVisualState(e.target as HTMLInputElement);
        }
        this.updateParamsFromDOM();
      });
    }
  }

  private addParamRow(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox" checked>
      <input type="text" placeholder="Key" class="key-input">
      <input type="text" placeholder="Value" class="value-input">
      <button class="remove-btn">×</button>
    `;

    paramsEditor.appendChild(row);
  }

  private updateParamsFromDOM(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    const params: Record<string, string> = {};
    const rows = paramsEditor.querySelectorAll('.kv-row');

    rows.forEach(row => {
      const checkbox = row.querySelector('.kv-checkbox') as HTMLInputElement;
      const keyInput = row.querySelector('.key-input') as HTMLInputElement;
      const valueInput = row.querySelector('.value-input') as HTMLInputElement;

      if (checkbox && checkbox.checked && keyInput && valueInput && keyInput.value.trim()) {
        params[keyInput.value.trim()] = valueInput.value.trim();
      }
    });

    this.onUpdateCallback?.(params);
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

  public loadParams(params: Record<string, string>): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (!paramsEditor) return;

    paramsEditor.innerHTML = '';

    Object.entries(params).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      row.innerHTML = `
        <input type="checkbox" class="kv-checkbox" checked>
        <input type="text" placeholder="Key" class="key-input" value="${key}">
        <input type="text" placeholder="Value" class="value-input" value="${value}">
        <button class="remove-btn">×</button>
      `;
      paramsEditor.appendChild(row);
    });

    if (paramsEditor.children.length === 0) {
      this.addParamRow();
    }
  }

  public clear(): void {
    const paramsEditor = this.container.querySelector('#params-editor');
    if (paramsEditor) {
      paramsEditor.innerHTML = '';
      this.addParamRow();
    }
  }

  public onUpdate(callback: (params: Record<string, string>) => void): void {
    this.onUpdateCallback = callback;
  }
}
import { EditorType, RequestEditorFactoryConfig, RequestBody } from '../../../types/request-types';

// Simple interfaces for editors - we'll use the existing implementations
interface BaseEditor {
  setContent(content: any): void;
  getContent(): any;
  show(): void;
  hide(): void;
  clear(): void;
  onChange(callback: () => void): void;
  destroy(): void;
}

export class RequestEditorFactory {
  private editors: Map<EditorType, BaseEditor> = new Map();
  private container: HTMLElement;
  private onEditorChangeCallback: ((editor: BaseEditor) => void) | null = null;

  constructor(container: HTMLElement, private config: RequestEditorFactoryConfig) {
    this.container = container;
    this.initializeEditors();
  }

  private initializeEditors(): void {
    // Create mock editors - in real implementation these would be actual editor instances
    const editorTypes: EditorType[] = ['json', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary'];
    
    editorTypes.forEach(type => {
      const editor = this.createEditor(type);
      this.editors.set(type, editor);
      
      // Setup change listeners
      editor.onChange(() => this.onEditorChangeCallback?.(editor));
    });
  }

  private createEditor(type: EditorType): BaseEditor {
    // This is a simplified implementation - in reality each editor would have its own class
    const editorElement = this.getOrCreateEditorElement(type);
    
    return {
      setContent: (content: any) => this.setEditorContent(type, content),
      getContent: () => this.getEditorContent(type),
      show: () => this.showEditor(type),
      hide: () => this.hideEditor(type),
      clear: () => this.clearEditor(type),
      onChange: (callback: () => void) => this.setupEditorChangeListener(type, callback),
      destroy: () => this.destroyEditor(type)
    };
  }

  private getOrCreateEditorElement(type: EditorType): HTMLElement {
    const editorId = `${type}-editor`;
    let element = document.getElementById(editorId);
    
    if (!element) {
      element = document.createElement('div');
      element.id = editorId;
      element.className = `request-editor ${type}-editor`;
      element.style.display = 'none';
      this.container.appendChild(element);
    }

    return element;
  }

  private setEditorContent(type: EditorType, content: any): void {
    const element = document.getElementById(`${type}-editor`);
    if (!element) return;

    // Handle different editor types
    switch (type) {
      case 'json':
        this.setJsonContent(element, content);
        break;
      case 'raw':
        this.setRawContent(element, content);
        break;
      case 'form-data':
        this.setFormDataContent(element, content);
        break;
      case 'x-www-form-urlencoded':
        this.setUrlEncodedContent(element, content);
        break;
      case 'binary':
        this.setBinaryContent(element, content);
        break;
    }
  }

  private setJsonContent(element: HTMLElement, content: any): void {
    let textarea = element.querySelector('textarea');
    if (!textarea) {
      textarea = document.createElement('textarea');
      textarea.className = 'json-textarea';
      textarea.placeholder = 'Enter JSON content...';
      element.appendChild(textarea);
    }

    if (typeof content === 'object') {
      textarea.value = JSON.stringify(content, null, 2);
    } else {
      textarea.value = content || '';
    }
  }

  private setRawContent(element: HTMLElement, content: any): void {
    let textarea = element.querySelector('textarea');
    if (!textarea) {
      textarea = document.createElement('textarea');
      textarea.className = 'raw-textarea';
      textarea.placeholder = 'Enter raw content...';
      element.appendChild(textarea);
    }

    textarea.value = String(content || '');
  }

  private setFormDataContent(element: HTMLElement, content: any): void {
    // Create form data editor interface
    element.innerHTML = `
      <div class="form-data-editor">
        <div class="kv-headers">
          <span>Key</span>
          <span>Value</span>
          <span>Type</span>
          <span></span>
        </div>
        <div class="form-data-rows" id="form-data-rows-${Math.random()}">
        </div>
        <button type="button" class="add-form-row">Add Row</button>
      </div>
    `;
  }

  private setUrlEncodedContent(element: HTMLElement, content: any): void {
    element.innerHTML = `
      <div class="url-encoded-editor">
        <textarea placeholder="key1=value1&key2=value2"></textarea>
      </div>
    `;
  }

  private setBinaryContent(element: HTMLElement, content: any): void {
    element.innerHTML = `
      <div class="binary-editor">
        <input type="file" class="binary-file-input">
        <div class="binary-info"></div>
      </div>
    `;
  }

  private getEditorContent(type: EditorType): any {
    const element = document.getElementById(`${type}-editor`);
    if (!element) return null;

    switch (type) {
      case 'json':
        return this.getJsonContent(element);
      case 'raw':
        return this.getRawContent(element);
      case 'form-data':
        return this.getFormDataContent(element);
      case 'x-www-form-urlencoded':
        return this.getUrlEncodedContent(element);
      case 'binary':
        return this.getBinaryContent(element);
      default:
        return null;
    }
  }

  private getJsonContent(element: HTMLElement): any {
    const textarea = element.querySelector('textarea');
    if (!textarea) return null;

    const value = textarea.value.trim();
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value; // Return as string if not valid JSON
    }
  }

  private getRawContent(element: HTMLElement): string {
    const textarea = element.querySelector('textarea');
    return textarea?.value || '';
  }

  private getFormDataContent(element: HTMLElement): Record<string, any> {
    // Extract form data from the editor
    const formData: Record<string, any> = {};
    // Implementation would extract key-value pairs from form rows
    return formData;
  }

  private getUrlEncodedContent(element: HTMLElement): string {
    const textarea = element.querySelector('textarea');
    return textarea?.value || '';
  }

  private getBinaryContent(element: HTMLElement): File | null {
    const input = element.querySelector('input[type="file"]') as HTMLInputElement;
    return input?.files?.[0] || null;
  }

  private showEditor(type: EditorType): void {
    const element = document.getElementById(`${type}-editor`);
    if (element) {
      element.style.display = 'block';
    }
  }

  private hideEditor(type: EditorType): void {
    const element = document.getElementById(`${type}-editor`);
    if (element) {
      element.style.display = 'none';
    }
  }

  private clearEditor(type: EditorType): void {
    this.setEditorContent(type, null);
  }

  private setupEditorChangeListener(type: EditorType, callback: () => void): void {
    const element = document.getElementById(`${type}-editor`);
    if (!element) return;

    // Add event listeners based on editor type
    const inputs = element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('input', callback);
      input.addEventListener('change', callback);
    });
  }

  private destroyEditor(type: EditorType): void {
    const element = document.getElementById(`${type}-editor`);
    element?.remove();
  }

  public switchEditor(from: EditorType, to: EditorType, content: RequestBody): void {
    const fromEditor = this.editors.get(from);
    const toEditor = this.editors.get(to);

    if (!fromEditor || !toEditor) return;

    // Hide current editor
    fromEditor.hide();

    // Convert content if needed
    const convertedContent = this.convertContent(content, from, to);

    // Show and populate new editor
    toEditor.setContent(convertedContent);
    toEditor.show();
  }

  private convertContent(content: RequestBody, from: EditorType, to: EditorType): any {
    if (!content) return null;

    // Basic content conversion logic
    if (from === 'json' && to === 'raw' && typeof content === 'object') {
      return JSON.stringify(content, null, 2);
    }

    if (from === 'raw' && to === 'json' && typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }

    return content;
  }

  public getEditor(type: EditorType): BaseEditor | undefined {
    return this.editors.get(type);
  }

  public onEditorChange(callback: (editor: BaseEditor) => void): void {
    this.onEditorChangeCallback = callback;
  }

  public destroy(): void {
    this.editors.forEach(editor => editor.destroy());
    this.editors.clear();
    this.onEditorChangeCallback = null;
  }
}
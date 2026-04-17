import { addVariableTooltips, detectVariables } from './variable-helper';
import { MonacoJsonEditor } from './MonacoJsonEditor';
import { MonacoXmlEditor } from './MonacoXmlEditor';
import { setupAutocomplete } from './variable-autocomplete';

type BodyType = 'none' | 'json' | 'raw' | 'form-urlencoded' | 'form-data';
type BodyFormat =
  | 'json'
  | 'xml'
  | 'yaml'
  | 'text'
  | 'form-urlencoded'
  | 'form-data';

interface FormDataField {
  key: string;
  value: string;
  type: 'text' | 'file';
  enabled: boolean;
  fileName?: string;
  contentType?: string;
}

export interface RequestBodyEditorEvents {
  onBodyChange: (body: {
    type: BodyType;
    content: string;
    format?: BodyFormat;
    contentType?: string;
    formDataFields?: FormDataField[];
  }) => void;
  onContentTypeChange?: (contentType: string | null | undefined) => void;
  onStatusUpdate: (
    type: 'info' | 'success' | 'warning' | 'error',
    message: string
  ) => void;
}

export class RequestBodyEditor {
  private container: HTMLElement;
  private events: RequestBodyEditorEvents;
  private currentBodyType: BodyType = 'none';
  private currentFormat: BodyFormat = 'json';
  private activeEnvironment: any;
  private globals: any;
  private folderVars: any;
  private highlightOverlay: HTMLDivElement | null = null;
  private monacoEditor: MonacoJsonEditor | null = null;
  private monacoXmlEditor: MonacoXmlEditor | null = null;
  private forcedContentType?: string;
  private formDataFields: FormDataField[] = [];
  private readonly formatContentTypes: Record<BodyFormat, string> = {
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    text: 'text/plain',
    'form-urlencoded': 'application/x-www-form-urlencoded',
    'form-data': 'multipart/form-data',
  };

  constructor(container: HTMLElement, events: RequestBodyEditorEvents) {
    this.container = container;
    this.events = events;
    this.initialize();
  }

  public setVariableContext(
    activeEnvironment: any,
    globals: any,
    folderVars?: any
  ): void {
    this.activeEnvironment = activeEnvironment;
    this.globals = globals;
    this.folderVars = folderVars;

    // Add variable tooltips and autocomplete to the textarea
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    if (bodyEditor && this.activeEnvironment && this.globals) {
      addVariableTooltips(
        bodyEditor,
        this.activeEnvironment,
        this.globals,
        this.folderVars
      );

      // Setup autocomplete for variable suggestions
      setupAutocomplete(bodyEditor, () => ({
        activeEnvironment: this.activeEnvironment,
        globals: this.globals,
        folderVars: this.folderVars || {},
      }));
    }

    // Update highlighting with new context
    this.updateHighlighting();
  }

  private initialize(): void {
    this.setupDOM();
    this.setupEventListeners();
  }

  private setupDOM(): void {
    this.container.innerHTML = `
      <div class="body-type-row">
        <div class="body-type-info">
          <div class="title">Payload</div>
        </div>
        <div class="body-type-selector">
          <label for="body-type-select" class="sr-only">Body type</label>
          <select id="body-type-select" class="body-type-select" aria-label="Body type">
            <option value="none" selected>None</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="yaml">YAML</option>
            <option value="text">Plain Text</option>
            <option value="form-urlencoded">Form URL Encoded</option>
            <option value="form-data">Form Data</option>
          </select>
        </div>
      </div>
      <div class="body-editor-container" id="body-editor-container" style="display: none;">
        <div class="body-editor-header">
          <div class="body-editor-heading sr-only">
            <div class="title">Request Body</div>
          </div>
          <div class="body-editor-actions">
            <div class="body-status" id="body-status"></div>
          </div>
        </div>
        <div class="body-editor-wrapper">
          <div id="monaco-json-editor" class="monaco-json-editor-container" style="display: none;"></div>
          <div class="syntax-highlight-overlay" id="syntax-highlight-overlay"></div>
          <textarea
            id="request-body"
            class="body-editor enhanced-json-editor"
            placeholder="Request body"
            spellcheck="false"
          ></textarea>
        </div>
      </div>
      <div class="form-data-container" id="form-data-container" style="display: none;">
        <div class="form-data-fields" id="form-data-fields"></div>
        <button class="form-data-add-btn" id="form-data-add-btn" type="button">
          <span class="form-data-add-icon">+</span> Add Field
        </button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Body type selector
    const bodyTypeSelect = this.container.querySelector(
      '#body-type-select'
    ) as HTMLSelectElement;
    if (bodyTypeSelect) {
      bodyTypeSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.handleBodySelectionChange(target.value as BodyFormat | 'none');
      });
    }

    // Body editor textarea
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    if (bodyEditor) {
      bodyEditor.addEventListener('input', () => {
        this.handleBodyContentChange();
        this.updateHighlighting();
      });
      bodyEditor.addEventListener('keydown', (e) => this.handleKeydown(e));
      bodyEditor.addEventListener('scroll', () => this.syncScroll());

      // Add variable tooltips and autocomplete
      if (this.activeEnvironment && this.globals) {
        addVariableTooltips(
          bodyEditor,
          this.activeEnvironment,
          this.globals,
          this.folderVars
        );
        setupAutocomplete(bodyEditor, () => ({
          activeEnvironment: this.activeEnvironment,
          globals: this.globals,
          folderVars: this.folderVars || {},
        }));
      }
    }

    // Watch for body section becoming visible to reset scroll position
    this.setupVisibilityWatcher();

    // Form data add button
    const addBtn = this.container.querySelector('#form-data-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.addFormDataField({
          key: '',
          value: '',
          type: 'text',
          enabled: true,
        });
        this.renderFormDataFields();
        this.emitFormDataChange();
      });
    }

    // Action buttons
    this.container
      .querySelector('#body-content-type')
      ?.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.handleFormatChange(target.value as BodyFormat);
      });

    // Listen for theme changes and refresh highlighting
    document.addEventListener('theme-changed', () => {
      this.updateHighlighting();
    });
  }

  private setupVisibilityWatcher(): void {
    // Watch for when the body section becomes active to reset scroll position
    const observer = new MutationObserver(() => {
      if (this.container.classList.contains('active')) {
        // Reset Monaco editor scroll position if active
        if (this.monacoEditor) {
          this.monacoEditor.scrollToTop();
        }
        if (this.monacoXmlEditor) {
          this.monacoXmlEditor.scrollToTop();
        }

        // Also reset textarea scroll position for consistency
        const textarea = this.container.querySelector(
          '#request-body'
        ) as HTMLTextAreaElement;
        if (textarea && textarea.style.display !== 'none') {
          textarea.scrollTop = 0;
        }
      }
    });

    observer.observe(this.container, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  private switchToMonacoEditor(initialValue: string = ''): void {
    const monacoContainer = this.container.querySelector(
      '#monaco-json-editor'
    ) as HTMLElement;
    const textarea = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const overlay = this.container.querySelector(
      '#syntax-highlight-overlay'
    ) as HTMLElement;

    if (!monacoContainer) return;

    // Dispose existing Monaco editor if any
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }

    // Get current value from textarea if no initial value provided
    const valueToSet = initialValue || textarea?.value || '';

    // Hide textarea and overlay, show Monaco container
    if (textarea) textarea.style.display = 'none';
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
    monacoContainer.style.display = 'block';

    // Create Monaco editor
    this.monacoEditor = new MonacoJsonEditor({
      container: monacoContainer,
      value: valueToSet,
      onChange: (value) => {
        // Update the hidden textarea to keep state in sync
        if (textarea) textarea.value = value;
        this.handleBodyContentChange();
      },
      onValidityChange: (valid, error) => {
        const statusElement = this.container.querySelector(
          '#body-status'
        ) as HTMLElement;
        if (statusElement) {
          if (!valid && error) {
            statusElement.textContent = 'Invalid JSON';
            statusElement.className = 'body-status invalid';
          } else {
            statusElement.textContent = '';
            statusElement.className = 'body-status';
          }
        }
      },
    });

    // Focus the Monaco editor
    setTimeout(() => {
      this.monacoEditor?.focus();
    }, 100);
  }

  private switchToMonacoXmlEditor(initialValue: string = ''): void {
    const monacoContainer = this.container.querySelector(
      '#monaco-json-editor'
    ) as HTMLElement;
    const textarea = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const overlay = this.container.querySelector(
      '#syntax-highlight-overlay'
    ) as HTMLElement;

    if (!monacoContainer) return;

    // Dispose existing editors
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
    if (this.monacoXmlEditor) {
      this.monacoXmlEditor.dispose();
      this.monacoXmlEditor = null;
    }

    const valueToSet = initialValue || textarea?.value || '';

    if (textarea) textarea.style.display = 'none';
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
    monacoContainer.style.display = 'block';

    this.monacoXmlEditor = new MonacoXmlEditor({
      container: monacoContainer,
      value: valueToSet,
      onChange: (value) => {
        if (textarea) textarea.value = value;
        this.handleBodyContentChange();
      },
    });

    setTimeout(() => {
      this.monacoXmlEditor?.focus();
    }, 100);
  }

  private switchToTextareaEditor(): void {
    const monacoContainer = this.container.querySelector(
      '#monaco-json-editor'
    ) as HTMLElement;
    const textarea = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;

    // Dispose Monaco JSON editor if active
    if (this.monacoEditor) {
      const currentValue = this.monacoEditor.getValue();
      this.monacoEditor.dispose();
      this.monacoEditor = null;
      if (textarea) textarea.value = currentValue;
    }

    // Dispose Monaco XML editor if active
    if (this.monacoXmlEditor) {
      const currentValue = this.monacoXmlEditor.getValue();
      this.monacoXmlEditor.dispose();
      this.monacoXmlEditor = null;
      if (textarea) textarea.value = currentValue;
    }

    // Hide Monaco, show textarea
    if (monacoContainer) monacoContainer.style.display = 'none';
    if (textarea) textarea.style.display = 'block';

    // Update highlighting for non-JSON formats
    this.updateHighlighting();
  }

  private handleBodyTypeChange(bodyType: string): void {
    // Deprecated path; keep for safety if called externally
    this.handleBodySelectionChange(bodyType as BodyFormat | 'none');
  }

  private handleBodySelectionChange(selection: BodyFormat | 'none'): void {
    const bodyEditorContainer = this.container.querySelector(
      '#body-editor-container'
    ) as HTMLElement;
    const formDataContainer = this.container.querySelector(
      '#form-data-container'
    ) as HTMLElement;
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const normalizedType = selection === 'none' ? 'none' : selection;

    if (normalizedType === 'none') {
      bodyEditorContainer.style.display = 'none';
      formDataContainer.style.display = 'none';
      // Clean up Monaco editor if active
      this.switchToTextareaEditor();
      this.currentBodyType = 'none';
      this.currentFormat = 'json';
      this.events.onBodyChange({
        type: this.currentBodyType,
        content: '',
        format: this.currentFormat,
        contentType: undefined,
      });
      this.events.onContentTypeChange?.(null);
    } else if (selection === 'form-data') {
      bodyEditorContainer.style.display = 'none';
      formDataContainer.style.display = 'flex';
      this.switchToTextareaEditor();
      this.currentBodyType = 'form-data';
      this.currentFormat = 'form-data';

      // Add a default empty row if no fields exist
      if (this.formDataFields.length === 0) {
        this.formDataFields.push({
          key: '',
          value: '',
          type: 'text',
          enabled: true,
        });
      }
      this.renderFormDataFields();
      this.emitFormDataChange();
      this.events.onContentTypeChange?.(this.getCurrentContentType());
    } else {
      bodyEditorContainer.style.display = 'flex';
      formDataContainer.style.display = 'none';

      if (selection === 'form-urlencoded') {
        this.currentBodyType = 'form-urlencoded';
        this.currentFormat = 'form-urlencoded';
      } else if (selection === 'json') {
        this.currentBodyType = 'json';
        this.currentFormat = 'json';
      } else {
        this.currentBodyType = 'raw';
        this.currentFormat = selection;
      }

      // Show/hide JSON-specific actions
      // Switch editor based on format
      if (this.currentFormat === 'json') {
        // Use Monaco editor for JSON
        const currentValue = bodyEditor.value.trim() || '{\n  \n}';
        this.switchToMonacoEditor(currentValue);
      } else if (this.currentFormat === 'xml') {
        // Use Monaco editor for XML
        const currentValue = bodyEditor.value.trim() || '';
        this.switchToMonacoXmlEditor(currentValue);
      } else {
        // Use textarea for other formats
        this.switchToTextareaEditor();

        if (normalizedType === 'raw') {
          bodyEditor.placeholder = 'Enter body...';
          bodyEditor.classList.remove('json-mode');
        } else if (normalizedType === 'form-urlencoded') {
          bodyEditor.placeholder = 'key1=value1&key2=value2';
          bodyEditor.classList.remove('json-mode');
        }
      }

      this.updateStatus();
      this.events.onBodyChange({
        type: this.currentBodyType,
        content: bodyEditor.value,
        format: this.currentFormat,
        contentType: this.getCurrentContentType(),
      });
      this.events.onContentTypeChange?.(this.getCurrentContentType());
    }
  }

  private handleBodyContentChange(): void {
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    this.updateStatus();
    this.events.onBodyChange({
      type: this.currentBodyType,
      content: bodyEditor.value,
      format: this.currentFormat,
      contentType: this.getCurrentContentType(),
    });
  }

  private handleKeydown(e: KeyboardEvent): void {
    const textarea = e.target as HTMLTextAreaElement;

    // Auto-indent for JSON
    if (this.currentFormat === 'json' && e.key === 'Enter') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const beforeCursor = textarea.value.substring(0, start);
      const afterCursor = textarea.value.substring(start);

      // Calculate indentation
      const currentLineMatch = beforeCursor.match(/^.*$/m);
      const currentLine = currentLineMatch ? currentLineMatch[0] : '';
      const indent = currentLine.match(/^\s*/)?.[0] || '';

      // Add extra indent if we're inside an object/array
      const lastChar = beforeCursor.trim().slice(-1);
      const nextChar = afterCursor.trim().charAt(0);
      const extraIndent =
        (lastChar === '{' || lastChar === '[') &&
        (nextChar === '}' || nextChar === ']')
          ? '  '
          : '';

      const newText =
        beforeCursor +
        '\n' +
        indent +
        extraIndent +
        (extraIndent ? '\n' + indent : '') +
        afterCursor;
      textarea.value = newText;
      textarea.setSelectionRange(
        start + 1 + indent.length + extraIndent.length,
        start + 1 + indent.length + extraIndent.length
      );

      this.handleBodyContentChange();
    }

    // Tab handling for JSON
    if (this.currentFormat === 'json' && e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        // Shift+Tab: Remove indent
        const beforeCursor = textarea.value.substring(0, start);
        const lines = beforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];
        if (currentLine.startsWith('  ')) {
          const newValue =
            textarea.value.substring(0, start - 2) +
            textarea.value.substring(start);
          textarea.value = newValue;
          textarea.setSelectionRange(start - 2, end - 2);
        }
      } else {
        // Tab: Add indent
        textarea.value =
          textarea.value.substring(0, start) +
          '  ' +
          textarea.value.substring(end);
        textarea.setSelectionRange(start + 2, start + 2);
      }

      this.handleBodyContentChange();
    }
  }

  private formatJson(): void {
    if (this.currentFormat !== 'json') {
      return;
    }

    // Use Monaco's format if active
    if (this.monacoEditor) {
      this.monacoEditor.format();
      this.events.onStatusUpdate('success', 'JSON formatted successfully');
      return;
    }

    // Fallback to textarea formatting (shouldn't happen in JSON mode)
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const text = bodyEditor.value.trim();

    if (!text) {
      this.events.onStatusUpdate('warning', 'No JSON to format');
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      bodyEditor.value = formatted;
      this.handleBodyContentChange();
      this.events.onStatusUpdate('success', 'JSON formatted successfully');
    } catch (error) {
      this.events.onStatusUpdate(
        'error',
        `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private updateStatus(): void {
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const statusElement = this.container.querySelector(
      '#body-status'
    ) as HTMLElement;
    const text = bodyEditor.value.trim();

    if (!statusElement) return;

    if (this.currentFormat === 'json') {
      try {
        JSON.parse(text || '{}');
        statusElement.textContent = '';
        statusElement.className = 'body-status';
      } catch (error) {
        statusElement.textContent = 'Invalid JSON';
        statusElement.className = 'body-status invalid';
      }
    } else {
      statusElement.textContent = '';
      statusElement.className = 'body-status';
    }
  }

  // Public methods for external control
  public setBody(body: {
    type: BodyType;
    content: string;
    format?: BodyFormat;
    contentType?: string;
    formDataFields?: FormDataField[];
  }): void {
    const normalizedType = body.type === 'json' ? 'raw' : body.type;
    const inferredFormat = this.inferFormat(body);
    const bodyTypeSelect = this.container.querySelector(
      '#body-type-select'
    ) as HTMLSelectElement;
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;

    this.currentFormat = inferredFormat;

    // Always reset form-data fields before loading new body
    this.formDataFields = [];

    // Load form-data fields if present
    if (body.type === 'form-data' && body.formDataFields) {
      this.formDataFields = body.formDataFields.map((f) => ({ ...f }));
    }

    if (bodyTypeSelect) {
      const selectionValue =
        normalizedType === 'none' ? 'none' : inferredFormat;
      bodyTypeSelect.value = selectionValue;
      this.handleBodySelectionChange(selectionValue as BodyFormat | 'none');
    }

    // Set the value in the appropriate editor
    if (inferredFormat === 'form-data') {
      // Already handled by handleBodySelectionChange → renderFormDataFields
    } else if (inferredFormat === 'json' && this.monacoEditor) {
      // Monaco editor is active for JSON
      this.monacoEditor.setValue(body.content);
    } else if (inferredFormat === 'xml' && this.monacoXmlEditor) {
      // Monaco editor is active for XML
      this.monacoXmlEditor.setValue(body.content);
    } else if (bodyEditor) {
      // Textarea for other formats
      bodyEditor.value = body.content;
      this.handleBodyContentChange();
      // Trigger highlighting when body is loaded
      this.updateHighlighting();
    }
  }

  public getBody(): {
    type: BodyType;
    content: string;
    format?: BodyFormat;
    contentType?: string;
    formDataFields?: FormDataField[];
  } {
    if (this.currentBodyType === 'form-data') {
      return {
        type: 'form-data',
        content: '',
        format: 'form-data',
        contentType: this.getCurrentContentType() || undefined,
        formDataFields: this.formDataFields.map((f) => ({ ...f })),
      };
    }

    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;

    // Get content from Monaco editor if active, otherwise from textarea
    const content = this.monacoEditor
      ? this.monacoEditor.getValue()
      : this.monacoXmlEditor
        ? this.monacoXmlEditor.getValue()
        : bodyEditor?.value || '';

    return {
      type: this.currentBodyType,
      content,
      format: this.currentFormat,
      contentType: this.getCurrentContentType() || undefined,
    };
  }

  public clear(): void {
    // Dispose Monaco editors if active
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
    if (this.monacoXmlEditor) {
      this.monacoXmlEditor.dispose();
      this.monacoXmlEditor = null;
    }

    // Clear form-data fields
    this.formDataFields = [];

    const bodyTypeSelect = this.container.querySelector(
      '#body-type-select'
    ) as HTMLSelectElement;
    if (bodyTypeSelect) {
      bodyTypeSelect.value = 'none';
      this.handleBodySelectionChange('none');
    }
  }

  public setForcedContentType(contentType?: string): void {
    this.forcedContentType = contentType;
    this.handleBodyContentChange();
  }

  public focusEditor(): void {
    if (this.monacoEditor) {
      this.monacoEditor.focus();
      return;
    }
    if (this.monacoXmlEditor) {
      this.monacoXmlEditor.focus();
      return;
    }

    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement | null;
    bodyEditor?.focus();
  }

  public destroy(): void {
    // Cleanup Monaco editors
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
    if (this.monacoXmlEditor) {
      this.monacoXmlEditor.dispose();
      this.monacoXmlEditor = null;
    }
  }

  // --- Form Data field management ---

  private addFormDataField(field: FormDataField): void {
    this.formDataFields.push(field);
  }

  private removeFormDataField(index: number): void {
    this.formDataFields.splice(index, 1);
    this.renderFormDataFields();
    this.emitFormDataChange();
  }

  private emitFormDataChange(): void {
    this.events.onBodyChange({
      type: 'form-data',
      content: '',
      format: 'form-data',
      contentType: this.getCurrentContentType(),
      formDataFields: this.formDataFields.map((f) => ({ ...f })),
    });
  }

  private renderFormDataFields(): void {
    const container = this.container.querySelector(
      '#form-data-fields'
    ) as HTMLElement;
    if (!container) return;

    container.innerHTML = '';

    this.formDataFields.forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'form-data-row';

      // Enable checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = field.enabled;
      checkbox.className = 'form-data-checkbox';
      checkbox.addEventListener('change', () => {
        this.formDataFields[index].enabled = checkbox.checked;
        this.emitFormDataChange();
      });

      // Key input
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'form-data-key';
      keyInput.placeholder = 'Key';
      keyInput.value = field.key;
      keyInput.addEventListener('input', () => {
        this.formDataFields[index].key = keyInput.value;
        this.emitFormDataChange();
      });

      // Type selector
      const typeSelect = document.createElement('select');
      typeSelect.className = 'form-data-type-select';
      const textOpt = document.createElement('option');
      textOpt.value = 'text';
      textOpt.textContent = 'Text';
      const fileOpt = document.createElement('option');
      fileOpt.value = 'file';
      fileOpt.textContent = 'File';
      typeSelect.appendChild(textOpt);
      typeSelect.appendChild(fileOpt);
      typeSelect.value = field.type;

      // Value area — text input or file picker
      const valueContainer = document.createElement('div');
      valueContainer.className = 'form-data-value-container';
      this.renderValueField(valueContainer, field, index);

      typeSelect.addEventListener('change', () => {
        const newType = typeSelect.value as 'text' | 'file';
        this.formDataFields[index].type = newType;
        this.formDataFields[index].value = '';
        this.formDataFields[index].fileName = undefined;
        this.formDataFields[index].contentType = undefined;
        this.renderValueField(
          valueContainer,
          this.formDataFields[index],
          index
        );
        this.emitFormDataChange();
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'form-data-delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Remove field';
      deleteBtn.addEventListener('click', () => {
        this.removeFormDataField(index);
      });

      row.appendChild(checkbox);
      row.appendChild(keyInput);
      row.appendChild(typeSelect);
      row.appendChild(valueContainer);
      row.appendChild(deleteBtn);
      container.appendChild(row);
    });
  }

  private renderValueField(
    container: HTMLElement,
    field: FormDataField,
    index: number
  ): void {
    container.innerHTML = '';

    if (field.type === 'text') {
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'form-data-value';
      valueInput.placeholder = 'Value';
      valueInput.value = field.value;
      valueInput.addEventListener('input', () => {
        this.formDataFields[index].value = valueInput.value;
        this.emitFormDataChange();
      });
      container.appendChild(valueInput);
    } else {
      // File type
      const fileBtn = document.createElement('button');
      fileBtn.type = 'button';
      fileBtn.className = 'form-data-file-btn';
      fileBtn.textContent = field.fileName || 'Choose File';
      if (field.fileName) {
        fileBtn.classList.add('has-file');
      }

      fileBtn.addEventListener('click', async () => {
        try {
          const result = await (window as any).restbro.files.pickForUpload();
          if (!result.canceled && result.filePath) {
            this.formDataFields[index].value = result.filePath;
            this.formDataFields[index].fileName = result.fileName;
            this.formDataFields[index].contentType = result.contentType;
            fileBtn.textContent = result.fileName;
            fileBtn.classList.add('has-file');
            this.emitFormDataChange();
          }
        } catch (err) {
          console.error('Failed to pick file:', err);
        }
      });

      container.appendChild(fileBtn);

      // Show filename hint if file is selected
      if (field.fileName) {
        const hint = document.createElement('span');
        hint.className = 'form-data-file-hint';
        hint.textContent = field.contentType || '';
        container.appendChild(hint);
      }
    }
  }

  private handleFormatChange(format: BodyFormat): void {
    this.currentFormat = format;
    if (this.currentBodyType === 'raw' && format === 'json') {
      this.currentBodyType = 'json';
    } else if (this.currentBodyType === 'json' && format !== 'json') {
      this.currentBodyType = 'raw';
    }

    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;

    if (bodyEditor) {
      if (format === 'json') {
        // Switch to Monaco editor for JSON
        const currentValue = bodyEditor.value.trim() || '{\n  \n}';
        this.switchToMonacoEditor(currentValue);
      } else if (format === 'xml') {
        // Switch to Monaco editor for XML
        const currentValue = bodyEditor.value.trim() || '';
        this.switchToMonacoXmlEditor(currentValue);
      } else {
        // Switch to textarea for other formats
        this.switchToTextareaEditor();

        if (format === 'form-urlencoded') {
          bodyEditor.placeholder = 'key1=value1&key2=value2';
          bodyEditor.classList.remove('json-mode');
        } else {
          bodyEditor.placeholder = 'Enter body...';
          bodyEditor.classList.remove('json-mode');
        }
      }
    }

    this.events.onContentTypeChange?.(this.getCurrentContentType());
    this.handleBodyContentChange();
  }

  private getCurrentContentType(): string | undefined {
    if (this.currentBodyType === 'none') {
      return undefined;
    }
    if (this.forcedContentType) {
      return this.forcedContentType;
    }
    return this.formatContentTypes[this.currentFormat] || undefined;
  }

  private inferFormat(body: {
    type: BodyType;
    content: string;
    format?: BodyFormat;
    contentType?: string;
  }): BodyFormat {
    if (body.format) {
      return body.format;
    }

    const normalizedContentType =
      body.contentType?.toLowerCase().split(';')[0] || '';
    switch (normalizedContentType) {
      case 'application/json':
        return 'json';
      case 'application/xml':
      case 'text/xml':
      case 'application/soap+xml':
        return 'xml';
      case 'application/x-yaml':
      case 'text/yaml':
        return 'yaml';
      case 'text/plain':
        return 'text';
      case 'application/x-www-form-urlencoded':
        return 'form-urlencoded';
      default:
        break;
    }

    if (body.type === 'json') {
      return 'json';
    }

    if (body.type === 'form-urlencoded') {
      return 'form-urlencoded';
    }

    if (body.type === 'form-data') {
      return 'form-data';
    }

    return 'text';
  }

  /**
   * Update syntax highlighting overlay with JSON syntax and variable highlighting
   */
  private updateHighlighting(): void {
    // Skip overlay when Monaco editor is active to avoid ghost text on theme changes
    if (this.monacoEditor) {
      const overlayHidden = this.container.querySelector(
        '#syntax-highlight-overlay'
      ) as HTMLDivElement;
      if (overlayHidden) {
        overlayHidden.style.display = 'none';
        overlayHidden.innerHTML = '';
      }
      return;
    }

    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const overlay = this.container.querySelector(
      '#syntax-highlight-overlay'
    ) as HTMLDivElement;

    if (!bodyEditor || !overlay) return;

    const text = bodyEditor.value;

    // Only apply syntax highlighting for JSON format
    if (this.currentFormat === 'json' && text.trim()) {
      const highlightedHtml = this.highlightJson(text);
      overlay.innerHTML = highlightedHtml;
      overlay.style.display = 'block';
      bodyEditor.classList.add('has-syntax-highlighting');
    } else {
      // For non-JSON, just highlight variables
      const highlightedHtml = this.highlightVariablesOnly(text);
      overlay.innerHTML = highlightedHtml;

      if (highlightedHtml) {
        overlay.style.display = 'block';
        bodyEditor.classList.add('has-syntax-highlighting');
      } else {
        overlay.style.display = 'none';
        bodyEditor.classList.remove('has-syntax-highlighting');
      }
    }
  }

  /**
   * Sync scroll position between textarea and overlay
   */
  private syncScroll(): void {
    const bodyEditor = this.container.querySelector(
      '#request-body'
    ) as HTMLTextAreaElement;
    const overlay = this.container.querySelector(
      '#syntax-highlight-overlay'
    ) as HTMLDivElement;

    if (bodyEditor && overlay) {
      overlay.scrollTop = bodyEditor.scrollTop;
      overlay.scrollLeft = bodyEditor.scrollLeft;
    }
  }

  /**
   * Highlight JSON syntax with color coding
   */
  private highlightJson(text: string): string {
    // Escape HTML
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Use a token-based approach to avoid regex conflicts
    const tokens: Array<{ type: string; value: string }> = [];

    // Simple tokenizer for JSON
    let i = 0;
    let currentToken = '';

    while (i < escaped.length) {
      const char = escaped[i];
      const nextChar = escaped[i + 1];

      // Check for variables {{...}}
      if (char === '{' && nextChar === '{') {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        const varEnd = escaped.indexOf('}}', i);
        if (varEnd !== -1) {
          tokens.push({
            type: 'variable',
            value: escaped.substring(i, varEnd + 2),
          });
          i = varEnd + 2;
          continue;
        }
      }

      // Check for strings
      if (char === '"') {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        let stringEnd = i + 1;
        while (stringEnd < escaped.length) {
          if (escaped[stringEnd] === '"' && escaped[stringEnd - 1] !== '\\') {
            break;
          }
          stringEnd++;
        }
        const stringValue = escaped.substring(i, stringEnd + 1);
        // Check if this is a key (followed by colon)
        let afterString = stringEnd + 1;
        while (
          afterString < escaped.length &&
          /\s/.test(escaped[afterString])
        ) {
          afterString++;
        }
        const isKey = escaped[afterString] === ':';
        tokens.push({ type: isKey ? 'key' : 'string', value: stringValue });
        i = stringEnd + 1;
        continue;
      }

      // Check for numbers
      if (/[\d-]/.test(char)) {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        let numEnd = i;
        while (numEnd < escaped.length && /[\d.\-e+]/.test(escaped[numEnd])) {
          numEnd++;
        }
        tokens.push({ type: 'number', value: escaped.substring(i, numEnd) });
        i = numEnd;
        continue;
      }

      // Check for keywords
      if (
        escaped.substring(i, i + 4) === 'true' ||
        escaped.substring(i, i + 5) === 'false'
      ) {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        const keyword =
          escaped.substring(i, i + 4) === 'true' ? 'true' : 'false';
        tokens.push({ type: 'boolean', value: keyword });
        i += keyword.length;
        continue;
      }

      if (escaped.substring(i, i + 4) === 'null') {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        tokens.push({ type: 'null', value: 'null' });
        i += 4;
        continue;
      }

      // Check for special characters
      if ('{}[]'.includes(char)) {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        tokens.push({ type: 'bracket', value: char });
        i++;
        continue;
      }

      if (':,'.includes(char)) {
        if (currentToken) {
          tokens.push({ type: 'text', value: currentToken });
          currentToken = '';
        }
        tokens.push({ type: 'punctuation', value: char });
        i++;
        continue;
      }

      currentToken += char;
      i++;
    }

    if (currentToken) {
      tokens.push({ type: 'text', value: currentToken });
    }

    // Convert tokens to HTML
    return tokens
      .map((token) => {
        switch (token.type) {
          case 'variable':
            return `<span class="json-variable">${token.value}</span>`;
          case 'key':
            return `<span class="json-key">${token.value}</span>`;
          case 'string':
            return `<span class="json-string">${token.value}</span>`;
          case 'number':
            return `<span class="json-number">${token.value}</span>`;
          case 'boolean':
            return `<span class="json-boolean">${token.value}</span>`;
          case 'null':
            return `<span class="json-null">${token.value}</span>`;
          case 'bracket':
            return `<span class="json-bracket">${token.value}</span>`;
          case 'punctuation':
            return `<span class="json-punctuation">${token.value}</span>`;
          default:
            return token.value;
        }
      })
      .join('');
  }

  /**
   * Highlight only variables in text (for non-JSON formats)
   */
  private highlightVariablesOnly(text: string): string {
    if (!text || (!this.activeEnvironment && !this.globals)) return '';

    const variables = detectVariables(text);
    if (variables.length === 0) return '';

    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Highlight variables
    result = result.replace(
      /(\{\{[^}]+\}\})/g,
      '<span class="json-variable">$1</span>'
    );

    return result;
  }
}

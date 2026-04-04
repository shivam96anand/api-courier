/**
 * Monaco-based XML editor for request body editing and read-only response viewing.
 * Uses the same theme/font conventions as MonacoJsonEditor for a consistent experience.
 */

import * as monaco from 'monaco-editor';

export interface MonacoXmlEditorOptions {
  container: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export class MonacoXmlEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onChange: (value: string) => void;
  private readOnly: boolean;

  constructor(options: MonacoXmlEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.readOnly = options.readOnly ?? false;
    this.initialize(options.value);
  }

  private getCssHexVariable(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '');
  }

  private applyTheme(): void {
    const primaryColor  = this.getCssHexVariable('--primary-color') || 'da70d6';
    const textPrimary   = this.getCssHexVariable('--text-primary')  || 'ffffff';
    const bg            = this.getCssHexVariable('--bg-primary')     || '1a1a1a';
    const lineNumColor  = this.getCssHexVariable('--json-line-number') || '6e6e6e';

    monaco.editor.defineTheme('api-courier-xml', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // Tags
        { token: 'tag',               foreground: primaryColor, fontStyle: 'bold' },
        { token: 'tag.id.xml',        foreground: primaryColor, fontStyle: 'bold' },
        { token: 'tag.id.html',       foreground: primaryColor, fontStyle: 'bold' },
        // Attribute names
        { token: 'attribute.name',    foreground: 'f8c771' },
        { token: 'attribute.name.xml',foreground: 'f8c771' },
        // Attribute values
        { token: 'attribute.value',   foreground: '98c379' },
        { token: 'attribute.value.xml',foreground: '98c379' },
        // Text content
        { token: 'delimiter.xml',     foreground: textPrimary },
        // Comments
        { token: 'comment',           foreground: '6a737d', fontStyle: 'italic' },
        // CDATA
        { token: 'cdata',             foreground: 'e6db74' },
        // Processing instructions
        { token: 'metatag',           foreground: '56b6c2' },
        { token: 'metatag.xml',       foreground: '56b6c2' },
      ],
      colors: {
        'editor.background':                `#${bg}`,
        'editor.foreground':                `#${textPrimary}`,
        'editorLineNumber.foreground':      `#${lineNumColor}`,
        'editor.selectionBackground':       '#404040',
        'editor.lineHighlightBackground':   '#2d2d2d',
      }
    });

    monaco.editor.setTheme('api-courier-xml');
  }

  private initialize(value: string): void {
    this.applyTheme();

    this.editor = monaco.editor.create(this.container, {
      value,
      language: 'xml',
      theme: 'api-courier-xml',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      lineNumbers: 'on',
      folding: true,
      formatOnPaste: !this.readOnly,
      readOnly: this.readOnly,
      domReadOnly: this.readOnly,
      fontFamily: "'SF Mono', 'Cascadia Code', Monaco, Menlo, Consolas, 'Courier New', monospace",
      letterSpacing: -0.3,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      autoIndent: 'full',
      bracketPairColorization: { enabled: false },
      padding: { top: 12, bottom: 12 },
    });

    this.editor.onDidChangeModelContent(() => {
      this.onChange(this.editor?.getValue() || '');
    });

    document.addEventListener('theme-changed', () => this.applyTheme());
  }

  public getValue(): string {
    return this.editor?.getValue() || '';
  }

  public setValue(value: string): void {
    if (this.editor && this.editor.getValue() !== value) {
      this.editor.setValue(value);
    }
  }

  public focus(): void {
    this.editor?.focus();
  }

  public scrollToTop(): void {
    this.editor?.setScrollPosition({ scrollTop: 0 });
  }

  public format(): void {
    this.editor?.getAction('editor.action.formatDocument')?.run();
  }

  public dispose(): void {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

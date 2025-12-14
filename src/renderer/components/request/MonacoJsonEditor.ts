/**
 * Monaco-based JSON editor for request body
 * Uses the same Monaco editor as JSON compare for a clean, professional editing experience
 */

import * as monaco from 'monaco-editor';

export interface MonacoJsonEditorOptions {
  container: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean, error?: string) => void;
}

export class MonacoJsonEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onChange: (value: string) => void;
  private onValidityChange?: (valid: boolean, error?: string) => void;

  constructor(options: MonacoJsonEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.onValidityChange = options.onValidityChange;

    this.initialize(options.value);
  }

  private getCurrentThemeColor(): string {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary-color')
      .trim();
    return color.replace('#', '');
  }

  private updateMonacoTheme(): void {
    const themeColor = this.getCurrentThemeColor();

    monaco.editor.defineTheme('api-courier-json', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
        { token: 'string.value.json', foreground: 'ffffff' },
        { token: 'number.json', foreground: 'ffffff' },
        { token: 'keyword.json', foreground: 'ffffff' },
        { token: 'delimiter.bracket.json', foreground: 'da70d6', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#1a1a1a',
        'editor.foreground': '#ffffff',
        'editorLineNumber.foreground': '#6e6e6e',
        'editor.selectionBackground': '#404040',
        'editor.lineHighlightBackground': '#2d2d2d',
      }
    });

    // Apply theme globally (affects all Monaco editors)
    monaco.editor.setTheme('api-courier-json');
  }

  private initialize(value: string): void {
    // Define initial theme
    this.updateMonacoTheme();

    // Create editor
    this.editor = monaco.editor.create(this.container, {
      value,
      language: 'json',
      theme: 'api-courier-json',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'on',
      folding: true,
      formatOnPaste: true,
      formatOnType: true,
      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      autoIndent: 'full',
      bracketPairColorization: {
        enabled: true
      },
      padding: {
        top: 12,
        bottom: 12
      }
    });

    // Listen to content changes
    this.editor.onDidChangeModelContent(() => {
      const newValue = this.editor?.getValue() || '';
      this.onChange(newValue);
      this.validateJson(newValue);
    });

    // Initial validation
    this.validateJson(value);

    // Listen for theme changes
    const handleThemeChange = () => {
      this.updateMonacoTheme();
    };
    document.addEventListener('theme-changed', handleThemeChange);
  }

  private validateJson(text: string): void {
    if (!text.trim()) {
      this.onValidityChange?.(true);
      return;
    }

    try {
      JSON.parse(text);
      this.onValidityChange?.(true);
    } catch (err) {
      const error = err as Error;
      this.onValidityChange?.(false, error.message);
    }
  }

  public getValue(): string {
    return this.editor?.getValue() || '';
  }

  public setValue(value: string): void {
    if (this.editor && this.editor.getValue() !== value) {
      this.editor.setValue(value);
      this.validateJson(value);
    }
  }

  public focus(): void {
    this.editor?.focus();
  }

  public scrollToTop(): void {
    if (this.editor) {
      this.editor.setScrollPosition({ scrollTop: 0 });
    }
  }

  public format(): void {
    if (!this.editor) return;

    const text = this.editor.getValue().trim();
    if (!text) return;

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      this.editor.setValue(formatted);
      this.onValidityChange?.(true);
    } catch (error) {
      // Don't format if invalid
      this.onValidityChange?.(false, error instanceof Error ? error.message : 'Invalid JSON');
    }
  }

  public dispose(): void {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

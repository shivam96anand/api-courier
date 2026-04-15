/**
 * Monaco-based JSON editor for request body and read-only response viewing.
 * Uses the same Monaco editor as JSON compare for a clean, professional editing experience.
 */

import * as monaco from 'monaco-editor';

export interface MonacoJsonEditorOptions {
  container: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean, error?: string) => void;
  readOnly?: boolean;
}

export class MonacoJsonEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onChange: (value: string) => void;
  private onValidityChange?: (valid: boolean, error?: string) => void;
  private readOnly: boolean;

  constructor(options: MonacoJsonEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.onValidityChange = options.onValidityChange;
    this.readOnly = options.readOnly ?? false;

    this.initialize(options.value);
  }

  private getCssHexVariable(name: string): string {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return color.replace('#', '');
  }

  private updateMonacoTheme(): void {
    const themeColor = this.getCssHexVariable('--primary-color');
    const valueColor = this.getCssHexVariable('--text-primary') || 'ffffff';
    const bracketColor = this.getCssHexVariable('--json-bracket') || 'da70d6';
    const editorBackground = this.getCssHexVariable('--bg-primary') || '1a1a1a';
    const lineNumberColor =
      this.getCssHexVariable('--json-line-number') || '6e6e6e';

    monaco.editor.defineTheme('restbro-json', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
        { token: 'string.value.json', foreground: valueColor },
        { token: 'string.json', foreground: valueColor },
        { token: 'number.json', foreground: valueColor },
        { token: 'keyword.json', foreground: valueColor },
        {
          token: 'delimiter.bracket.json',
          foreground: bracketColor,
          fontStyle: 'bold',
        },
        { token: 'delimiter.colon.json', foreground: valueColor },
        { token: 'delimiter.comma.json', foreground: bracketColor },
      ],
      colors: {
        'editor.background': `#${editorBackground}`,
        'editor.foreground': '#ffffff',
        'editorLineNumber.foreground': `#${lineNumberColor}`,
        'editor.selectionBackground': '#404040',
        'editor.lineHighlightBackground': '#2d2d2d',
        'editorBracketHighlight.foreground1': `#${bracketColor}`,
        'editorBracketHighlight.foreground2': `#${bracketColor}`,
        'editorBracketHighlight.foreground3': `#${bracketColor}`,
        'editorBracketHighlight.foreground4': `#${bracketColor}`,
        'editorBracketHighlight.foreground5': `#${bracketColor}`,
        'editorBracketHighlight.foreground6': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground1': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground2': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground3': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground4': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground5': `#${bracketColor}`,
        'editorBracketPairGuide.activeBackground6': `#${bracketColor}`,
        'editorBracketHighlight.unexpectedBracket.foreground': `#${bracketColor}`,
      },
    });

    // Apply theme globally (affects all Monaco editors)
    monaco.editor.setTheme('restbro-json');
  }

  private initialize(value: string): void {
    // Define initial theme
    this.updateMonacoTheme();

    // Create editor
    this.editor = monaco.editor.create(this.container, {
      value,
      language: 'json',
      theme: 'restbro-json',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      lineNumbers: 'on',
      folding: true,
      formatOnPaste: !this.readOnly,
      formatOnType: !this.readOnly,
      readOnly: this.readOnly,
      domReadOnly: this.readOnly,
      fontFamily:
        "'SF Mono', 'Cascadia Code', Monaco, Menlo, Consolas, 'Courier New', monospace",
      letterSpacing: -0.3,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      autoIndent: 'full',
      bracketPairColorization: {
        enabled: false,
      },
      padding: {
        top: 12,
        bottom: 12,
      },
    });

    // Listen to content changes
    this.editor.onDidChangeModelContent(() => {
      const newValue = this.editor?.getValue() || '';
      this.onChange(newValue);
      this.validateJson(newValue);
    });

    // Initial validation
    this.validateJson(value);

    // Re-apply theme after first render to ensure bracket colorization is correct
    requestAnimationFrame(() => {
      this.updateMonacoTheme();
      this.editor?.updateOptions({
        bracketPairColorization: { enabled: false },
      });
    });

    // Listen for theme changes
    const handleThemeChange = () => {
      this.updateMonacoTheme();
      this.editor?.updateOptions({
        bracketPairColorization: { enabled: false },
      });
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
      this.onValidityChange?.(
        false,
        error instanceof Error ? error.message : 'Invalid JSON'
      );
    }
  }

  /** Fold all regions in the editor */
  public foldAll(): void {
    if (!this.editor) return;
    this.editor.getAction('editor.foldAll')?.run();
  }

  /** Unfold all regions in the editor */
  public unfoldAll(): void {
    if (!this.editor) return;
    this.editor.getAction('editor.unfoldAll')?.run();
  }

  /** Open Monaco's built-in find widget */
  public triggerFind(): void {
    if (!this.editor) return;
    this.editor.focus();
    this.editor.getAction('actions.find')?.run();
  }

  /** Find matches in the model (for external search bars) */
  public findMatches(query: string): monaco.editor.FindMatch[] {
    if (!this.editor || !query) return [];
    const model = this.editor.getModel();
    if (!model) return [];
    return model.findMatches(query, true, false, false, null, true);
  }

  /** Scroll to the bottom of the editor */
  public scrollToBottom(): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    this.editor.revealLine(lineCount);
  }

  /** Get the underlying Monaco editor instance */
  public getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return this.editor;
  }

  /** Capture the editor view state (cursor/scroll/contributions). */
  public saveViewState(): monaco.editor.ICodeEditorViewState | null {
    return this.editor?.saveViewState() ?? null;
  }

  /** Restore a previously captured editor view state. */
  public restoreViewState(state: Record<string, unknown>): void {
    if (!this.editor) return;
    this.editor.restoreViewState(
      state as unknown as monaco.editor.ICodeEditorViewState
    );
  }

  public dispose(): void {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

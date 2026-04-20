/**
 * Monaco-based JSON editor for JSON Viewer input panel
 * Provides inline validation with error markers and real-time validation feedback
 */

import * as monaco from 'monaco-editor';

export interface MonacoInputEditorOptions {
  container: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  onValidityChange: (valid: boolean, error?: string) => void;
}

export class MonacoInputEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onChange: (value: string) => void;
  private onValidityChange: (valid: boolean, error?: string) => void;
  private themeChangeHandler: (() => void) | null = null;
  private errorDecorations: string[] = [];

  constructor(options: MonacoInputEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.onValidityChange = options.onValidityChange;

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
    const bracketColor = this.getCssHexVariable('--primary-color') || 'da70d6';
    const editorBackground = this.getCssHexVariable('--bg-primary') || '1a1a1a';
    const lineNumberColor =
      this.getCssHexVariable('--json-line-number') || '6e6e6e';

    monaco.editor.defineTheme('restbro-json-viewer', {
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

    // Apply theme to this editor
    monaco.editor.setTheme('restbro-json-viewer');
  }

  private initialize(value: string): void {
    // Define initial theme
    this.updateMonacoTheme();

    // Create editor
    this.editor = monaco.editor.create(this.container, {
      value,
      language: 'json',
      theme: 'restbro-json-viewer',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'on',
      folding: true,
      formatOnPaste: true,
      formatOnType: true,
      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
      glyphMargin: true,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      autoIndent: 'full',
      bracketPairColorization: {
        enabled: true,
      },
      padding: {
        top: 12,
        bottom: 12,
      },
      // Enable error/warning markers
      renderValidationDecorations: 'on',
      showUnused: true,
      showDeprecated: true,
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
    this.themeChangeHandler = () => {
      this.updateMonacoTheme();
    };
    document.addEventListener('theme-changed', this.themeChangeHandler);
  }

  private validateJson(text: string): void {
    if (!this.editor) return;

    if (!text.trim()) {
      this.clearErrorDecorations();
      this.onValidityChange(true);
      return;
    }

    try {
      JSON.parse(text);
      this.clearErrorDecorations();
      this.onValidityChange(true);
    } catch (err) {
      const error = err as Error;
      this.addErrorDecoration(text, error.message);
      this.onValidityChange(false, error.message);
    }
  }

  private clearErrorDecorations(): void {
    if (!this.editor) return;
    this.errorDecorations = this.editor.deltaDecorations(
      this.errorDecorations,
      []
    );
  }

  private addErrorDecoration(text: string, errorMessage: string): void {
    if (!this.editor) return;

    // Parse error position from error message
    const positionMatch = errorMessage.match(/position (\d+)/);
    if (!positionMatch) {
      // If we can't find position, highlight the whole document
      const model = this.editor.getModel();
      if (!model) return;

      const lineCount = model.getLineCount();
      this.errorDecorations = this.editor.deltaDecorations(
        this.errorDecorations,
        [
          {
            range: new monaco.Range(
              1,
              1,
              lineCount,
              model.getLineMaxColumn(lineCount)
            ),
            options: {
              className: 'json-error-decoration',
              glyphMarginClassName: 'json-error-glyph',
              isWholeLine: false,
            },
          },
        ]
      );
      return;
    }

    const position = parseInt(positionMatch[1], 10);
    const model = this.editor.getModel();
    if (!model) return;

    // Convert character position to line/column
    const pos = model.getPositionAt(position);

    // Highlight the error position
    this.errorDecorations = this.editor.deltaDecorations(
      this.errorDecorations,
      [
        {
          range: new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + 1
          ),
          options: {
            className: 'json-error-decoration',
            glyphMarginClassName: 'json-error-glyph',
            inlineClassName: 'json-error-inline',
            minimap: {
              color: '#f85149',
              position: monaco.editor.MinimapPosition.Inline,
            },
          },
        },
      ]
    );

    // Scroll to the error
    this.editor.revealPositionInCenter(pos);
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

  public format(): void {
    if (!this.editor) return;

    const text = this.editor.getValue().trim();
    if (!text) return;

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      this.editor.setValue(formatted);
      this.onValidityChange(true);
    } catch (error) {
      // Don't format if invalid
      this.onValidityChange(
        false,
        error instanceof Error ? error.message : 'Invalid JSON'
      );
    }
  }

  public minify(): void {
    if (!this.editor) return;

    const text = this.editor.getValue().trim();
    if (!text) return;

    try {
      const parsed = JSON.parse(text);
      const minified = JSON.stringify(parsed);
      this.editor.setValue(minified);
      this.onValidityChange(true);
    } catch (error) {
      // Don't minify if invalid
      this.onValidityChange(
        false,
        error instanceof Error ? error.message : 'Invalid JSON'
      );
    }
  }

  public clear(): void {
    if (this.editor) {
      this.editor.setValue('');
      this.onValidityChange(true);
    }
  }

  public foldAll(): void {
    this.editor?.trigger('', 'editor.foldAll', {});
  }

  public unfoldAll(): void {
    this.editor?.trigger('', 'editor.unfoldAll', {});
  }

  public scrollToTop(): void {
    this.editor?.revealLine(1);
    this.editor?.setPosition({ lineNumber: 1, column: 1 });
  }

  public scrollToBottom(): void {
    const model = this.editor?.getModel();
    if (model) {
      const lastLine = model.getLineCount();
      this.editor?.revealLine(lastLine);
      this.editor?.setPosition({ lineNumber: lastLine, column: 1 });
    }
  }

  public openSearch(): void {
    this.editor?.trigger('', 'actions.find', {});
  }

  public dispose(): void {
    if (this.themeChangeHandler) {
      document.removeEventListener('theme-changed', this.themeChangeHandler);
      this.themeChangeHandler = null;
    }

    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

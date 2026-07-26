/**
 * Monaco-based JSON editor for request body and read-only response viewing.
 * Uses the same Monaco editor as JSON compare for a clean, professional editing experience.
 */

import * as monaco from 'monaco-editor';
import { forceInitialViewportTokenization } from './monaco-tokenization';

export interface MonacoJsonEditorOptions {
  container: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean, error?: string) => void;
  readOnly?: boolean;
  /**
   * When true, Cmd/Ctrl+F toggles the find widget (open when hidden, close
   * when already showing) instead of Monaco's default open-only behavior.
   */
  toggleFindShortcut?: boolean;
}

export class MonacoJsonEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onChange: (value: string) => void;
  private onValidityChange?: (valid: boolean, error?: string) => void;
  private readOnly: boolean;
  private toggleFindShortcut: boolean;
  private findShortcutHandler?: (e: KeyboardEvent) => void;
  private errorDecorations: string[] = [];

  constructor(options: MonacoJsonEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.onValidityChange = options.onValidityChange;
    this.readOnly = options.readOnly ?? false;
    this.toggleFindShortcut = options.toggleFindShortcut ?? false;

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
    // Brackets must always match the theme primary color. Reading
    // --primary-color directly (instead of the parallel --json-bracket var)
    // removes a sync hazard where the two variables briefly disagreed and
    // brackets rendered in the SCSS default magenta while keys already used
    // the user's selected theme color.
    const bracketColor = themeColor || 'da70d6';
    const editorBackground = this.getCssHexVariable('--bg-primary') || '1a1a1a';
    const lineNumberColor =
      this.getCssHexVariable('--json-line-number') || '6e6e6e';

    // IMPORTANT — DO NOT "simplify" the delimiter rules below.
    //
    // Monaco's JSON tokenizer emits these token names (NOT `delimiter.bracket.json`):
    //   - `delimiter.array.json`   for `[` and `]`
    //   - `delimiter.bracket.json` for `{` and `}`   (a.k.a. "object brackets")
    //   - `delimiter.colon.json`
    //   - `delimiter.comma.json`
    //
    // Listing only `delimiter.bracket.json` worked by accident for `{}` but left
    // `[]` (array brackets) unstyled. On first paint that fell through to Monaco's
    // built-in rainbow `editorBracketHighlight.foregroundN`, producing the
    // multi-color brace bug that "fixed itself" after a tab switch (which forced
    // a re-tokenize against an updated theme). All five rules MUST stay.
    monaco.editor.defineTheme('restbro-json', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // JSON tokens
        { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
        { token: 'string.value.json', foreground: valueColor },
        { token: 'string.json', foreground: valueColor },
        { token: 'number.json', foreground: valueColor },
        { token: 'keyword.json', foreground: valueColor },
        {
          token: 'delimiter.array.json',
          foreground: bracketColor,
          fontStyle: 'bold',
        },
        {
          token: 'delimiter.bracket.json',
          foreground: bracketColor,
          fontStyle: 'bold',
        },
        { token: 'delimiter.colon.json', foreground: valueColor },
        { token: 'delimiter.comma.json', foreground: bracketColor },
        // XML tokens (shared theme so switching editors doesn't clobber)
        { token: 'tag', foreground: themeColor, fontStyle: 'bold' },
        { token: 'tag.id.xml', foreground: themeColor, fontStyle: 'bold' },
        { token: 'attribute.name', foreground: 'f8c771' },
        { token: 'attribute.name.xml', foreground: 'f8c771' },
        { token: 'attribute.value', foreground: '98c379' },
        { token: 'attribute.value.xml', foreground: '98c379' },
        { token: 'delimiter.xml', foreground: valueColor },
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'cdata', foreground: 'e6db74' },
        { token: 'metatag', foreground: '56b6c2' },
        { token: 'metatag.xml', foreground: '56b6c2' },
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
        // Theme-aware, professional scrollbar sliders (neutral at rest,
        // primary-tinted on hover/drag) — matches the app-wide native
        // scrollbars defined in `_scrollbars.scss`.
        'scrollbarSlider.background': '#ffffff26',
        'scrollbarSlider.hoverBackground': `#${themeColor}66`,
        'scrollbarSlider.activeBackground': `#${themeColor}99`,
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
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 12,
        horizontalScrollbarSize: 12,
        useShadows: false,
      },
      // Copy as plain text only (no syntax-highlighted HTML on the clipboard).
      copyWithSyntaxHighlighting: false,
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
      lineNumbersMinChars: 1,
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

    // Tokenize the initial viewport synchronously so the first paint is already
    // themed (avoids Monaco's white-then-colored syntax-highlight flash).
    forceInitialViewportTokenization(this.editor);

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

    if (this.toggleFindShortcut) {
      this.setupFindToggleShortcut();
    }
  }

  /**
   * Make Cmd/Ctrl+F toggle the find widget. A capture-phase listener on the
   * container preempts Monaco's own Cmd/Ctrl+F handling (which merely re-focuses
   * the find input when the widget is already open), so a second press closes
   * it. When focus is outside the editor, this never fires and the document-level
   * shortcut handler opens the widget as before.
   */
  private setupFindToggleShortcut(): void {
    this.findShortcutHandler = (e: KeyboardEvent) => {
      const isFindChord =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === 'f' || e.key === 'F');
      if (!isFindChord) return;
      e.preventDefault();
      e.stopPropagation();
      this.toggleFind();
    };
    this.container.addEventListener('keydown', this.findShortcutHandler, true);
  }

  private validateJson(text: string): void {
    if (!text.trim()) {
      this.clearErrorDecorations();
      this.onValidityChange?.(true);
      return;
    }

    try {
      JSON.parse(text);
      this.clearErrorDecorations();
      this.onValidityChange?.(true);
    } catch (err) {
      const error = err as Error;
      this.addErrorDecoration(text, error.message);
      this.onValidityChange?.(false, error.message);
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
    const model = this.editor.getModel();
    if (!model) return;

    const positionMatch = errorMessage.match(/position (\d+)/);
    if (positionMatch) {
      const pos = model.getPositionAt(parseInt(positionMatch[1], 10));
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
              isWholeLine: false,
            },
          },
        ]
      );
    } else {
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

  /**
   * Toggle Monaco's built-in find widget: open + focus it when hidden, close
   * it when it's already showing. Reads the find controller's live state so it
   * stays in sync no matter how the widget was opened (icon, Cmd/Ctrl+F, Esc).
   */
  public toggleFind(): void {
    if (!this.editor) return;
    const findController = this.editor.getContribution(
      'editor.contrib.findController'
    ) as unknown as {
      getState?: () => { isRevealed?: boolean } | undefined;
      closeFindWidget?: () => void;
    } | null;

    if (findController?.getState?.()?.isRevealed) {
      findController.closeFindWidget?.();
      return;
    }

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

  /** Toggle soft word wrapping. */
  public setWordWrap(on: boolean): void {
    this.editor?.updateOptions({ wordWrap: on ? 'on' : 'off' });
  }

  /** Set the editor font size (px). */
  public setFontSize(px: number): void {
    this.editor?.updateOptions({ fontSize: px });
  }

  /** Current editor font size (px). */
  public getFontSize(): number {
    if (!this.editor) return 12;
    return (
      (this.editor.getOption(monaco.editor.EditorOption.fontSize) as number) ??
      12
    );
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
    if (this.findShortcutHandler) {
      this.container.removeEventListener(
        'keydown',
        this.findShortcutHandler,
        true
      );
      this.findShortcutHandler = undefined;
    }
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

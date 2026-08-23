/**
 * Monaco-based JSON editor for request body and read-only response viewing.
 * Uses the same Monaco editor as JSON compare for a clean, professional editing experience.
 */

import * as monaco from 'monaco-editor';
import { forceInitialViewportTokenization } from './monaco-tokenization';
import { parseJsonErrorOffset, validateJsonText } from './json-error-position';
import { defineRestbroJsonTheme } from '../../utils/monaco-restbro-theme';
import { getBodyFontSize } from '../../utils/body-font-size';

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
  private errorDecorations: monaco.editor.IEditorDecorationsCollection | null =
    null;
  private validateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MonacoJsonEditorOptions) {
    this.container = options.container;
    this.onChange = options.onChange;
    this.onValidityChange = options.onValidityChange;
    this.readOnly = options.readOnly ?? false;
    this.toggleFindShortcut = options.toggleFindShortcut ?? false;

    this.initialize(options.value);
  }

  private updateMonacoTheme(): void {
    defineRestbroJsonTheme();
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
      fontSize: getBodyFontSize(),
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
      this.scheduleValidation(newValue);
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

  /**
   * Monaco forbids mutating decorations from inside onDidChangeModelContent,
   * so validation is deferred. The delay also avoids re-parsing a large body
   * on every keystroke.
   */
  private scheduleValidation(text: string): void {
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => {
      this.validateTimer = null;
      this.validateJson(text);
    }, 150);
  }

  private validateJson(text: string): void {
    const result = validateJsonText(text);
    if (result.valid) {
      this.clearErrorDecorations();
      this.onValidityChange?.(true);
      return;
    }
    this.addErrorDecoration(text, result.error ?? 'Invalid JSON');
    this.onValidityChange?.(false, result.error);
  }

  private clearErrorDecorations(): void {
    this.errorDecorations?.clear();
  }

  /** Lazily create the collection so it survives across validations. */
  private setErrorDecorations(
    decorations: monaco.editor.IModelDeltaDecoration[]
  ): void {
    if (!this.editor) return;
    this.errorDecorations ??= this.editor.createDecorationsCollection();
    this.errorDecorations.set(decorations);
  }

  private addErrorDecoration(text: string, errorMessage: string): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;

    const options: monaco.editor.IModelDecorationOptions = {
      className: 'json-error-decoration',
      glyphMarginClassName: 'json-error-glyph',
      isWholeLine: false,
    };

    const offset = parseJsonErrorOffset(errorMessage);
    if (offset !== null) {
      const pos = model.getPositionAt(offset);
      this.setErrorDecorations([
        {
          range: new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + 1
          ),
          options,
        },
      ]);
    } else {
      const lineCount = model.getLineCount();
      this.setErrorDecorations([
        {
          range: new monaco.Range(
            1,
            1,
            lineCount,
            model.getLineMaxColumn(lineCount)
          ),
          options,
        },
      ]);
    }
  }

  public getValue(): string {
    return this.editor?.getValue() || '';
  }

  public setValue(value: string): void {
    if (this.editor && this.editor.getValue() !== value) {
      this.editor.setValue(value);
      // Swapping content resets tokenization, so re-tokenize the viewport
      // before paint (e.g. switching requests) to avoid the white flash.
      forceInitialViewportTokenization(this.editor);
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
    if (this.validateTimer) {
      clearTimeout(this.validateTimer);
      this.validateTimer = null;
    }
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
    this.errorDecorations = null;
  }
}

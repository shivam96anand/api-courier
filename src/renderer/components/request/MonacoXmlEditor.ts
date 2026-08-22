/**
 * Monaco-based XML editor for request body editing and read-only response viewing.
 * Uses the same theme/font conventions as MonacoJsonEditor for a consistent experience.
 */

import * as monaco from 'monaco-editor';
import { forceInitialViewportTokenization } from './monaco-tokenization';
import { parseXml, prettyPrintXml } from './soap-xml-helpers';
import { defineRestbroJsonTheme } from '../../utils/monaco-restbro-theme';

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

  private applyTheme(): void {
    // Must define (not just reference) 'restbro-json': Monaco silently falls
    // back to its LIGHT theme for an unknown name, so an XML editor opened
    // before any JSON editor rendered on a white background. Redefining the
    // active theme re-applies it, which also covers 'theme-changed'.
    defineRestbroJsonTheme();
  }

  private initialize(value: string): void {
    this.applyTheme();

    this.editor = monaco.editor.create(this.container, {
      value,
      language: 'xml',
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
      bracketPairColorization: { enabled: false },
      padding: { top: 12, bottom: 12 },
    });

    // Tokenize the initial viewport synchronously so the first paint is already
    // themed (avoids Monaco's white-then-colored syntax-highlight flash).
    forceInitialViewportTokenization(this.editor);

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
      // Swapping content resets tokenization, so re-tokenize the viewport
      // before paint (e.g. switching requests) to avoid the white flash.
      forceInitialViewportTokenization(this.editor);
    }
  }

  public focus(): void {
    this.editor?.focus();
  }

  public scrollToTop(): void {
    this.editor?.setScrollPosition({ scrollTop: 0 });
  }

  public scrollToBottom(): void {
    const model = this.editor?.getModel();
    if (!this.editor || !model) return;
    this.editor.revealLine(model.getLineCount());
  }

  /** Fold all regions in the editor */
  public foldAll(): void {
    this.editor?.getAction('editor.foldAll')?.run();
  }

  /** Unfold all regions in the editor */
  public unfoldAll(): void {
    this.editor?.getAction('editor.unfoldAll')?.run();
  }

  /** Open Monaco's built-in find widget */
  public triggerFind(): void {
    if (!this.editor) return;
    this.editor.focus();
    this.editor.getAction('actions.find')?.run();
  }

  /**
   * Toggle Monaco's built-in find widget. Reads the find controller's live
   * state so it stays in sync however the widget was opened (icon, Cmd/Ctrl+F,
   * Esc).
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

    this.triggerFind();
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

  /**
   * Pretty-print the XML content. Monaco ships no built-in XML formatter, so we
   * parse + re-serialize via the shared soap-xml helpers. Returns `true` on
   * success, `false` when the body is empty or not well-formed (caller decides
   * how to surface the outcome).
   */
  public format(): boolean {
    if (!this.editor) return false;
    const text = this.editor.getValue().trim();
    if (!text) return false;

    const parsed = parseXml(text);
    if (!parsed.valid || !parsed.document) return false;

    this.editor.setValue(prettyPrintXml(parsed.document));
    return true;
  }

  public dispose(): void {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

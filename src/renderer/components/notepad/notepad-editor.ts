/**
 * Notepad Monaco editor: theme + factory + editor-action helpers.
 */
import * as monaco from 'monaco-editor';
// Tokenizers for languages whose webpack-plugin label would also pull a
// language-service worker we don't need (TypeScript alone bundles the whole
// compiler). Monarch highlighting only — no validation/IntelliSense.
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import { forceInitialViewportTokenization } from '../request/monaco-tokenization';
import { xmlTokenRules } from '../../utils/monaco-xml-tokens';

export interface NotepadEditorOptions {
  fontSize: number;
  wordWrap?: 'on' | 'off';
  tabSize?: number;
}

export interface NotepadEditorCallbacks {
  onContentChange: (value: string) => void;
  onCursorChange: (
    lineNumber: number,
    column: number,
    selectionLength: number
  ) => void;
}

function getCssHexVariable(name: string): string {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return color.replace('#', '');
}

export function updateMonacoTheme(): void {
  const themeColor = getCssHexVariable('--primary-color');
  const valueColor = getCssHexVariable('--text-primary') || 'ffffff';
  const editorBackground = getCssHexVariable('--bg-primary') || '1a1a1a';
  const lineNumberColor = getCssHexVariable('--json-line-number') || '6e6e6e';

  monaco.editor.defineTheme('restbro-notepad', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: valueColor },
      { token: 'string.key.json', foreground: themeColor, fontStyle: 'bold' },
      { token: 'string.value.json', foreground: valueColor },
      { token: 'string.json', foreground: valueColor },
      { token: 'number.json', foreground: valueColor },
      { token: 'keyword.json', foreground: valueColor },
      // Clean/classic look: punctuation (braces, brackets, colons, commas)
      // renders in the neutral value color — no primary tint, no bold. Combined
      // with bracketPairColorization disabled this removes the "rainbow braces".
      { token: 'delimiter.bracket.json', foreground: valueColor },
      { token: 'delimiter.array.json', foreground: valueColor },
      { token: 'delimiter.colon.json', foreground: valueColor },
      { token: 'delimiter.comma.json', foreground: valueColor },
      // XML/HTML — same palette as the request/response editor so a SOAP body
      // looks identical in both places. Other languages keep Monaco's defaults.
      ...xmlTokenRules(themeColor, valueColor),
    ],
    colors: {
      'editor.background': `#${editorBackground}`,
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': `#${lineNumberColor}`,
      'editor.selectionBackground': '#404040',
      'editor.lineHighlightBackground': '#2d2d2d',
      // Keep bracket-pair highlight uniform (neutral) as a safety net in case
      // colorization is ever re-enabled — prevents rainbow braces.
      'editorBracketHighlight.foreground1': `#${valueColor}`,
      'editorBracketHighlight.foreground2': `#${valueColor}`,
      'editorBracketHighlight.foreground3': `#${valueColor}`,
      'editorBracketHighlight.foreground4': `#${valueColor}`,
      'editorBracketHighlight.foreground5': `#${valueColor}`,
      'editorBracketHighlight.foreground6': `#${valueColor}`,
      'editorBracketHighlight.unexpectedBracket.foreground': `#${valueColor}`,
      // Theme-aware scrollbar sliders — matches the app-wide native scrollbars
      // defined in `_scrollbars.scss`.
      'scrollbarSlider.background': '#ffffff26',
      'scrollbarSlider.hoverBackground': `#${themeColor}66`,
      'scrollbarSlider.activeBackground': `#${themeColor}99`,
    },
  });

  monaco.editor.setTheme('restbro-notepad');
}

export function createNotepadEditor(
  container: HTMLElement,
  options: NotepadEditorOptions,
  callbacks: NotepadEditorCallbacks
): monaco.editor.IStandaloneCodeEditor {
  updateMonacoTheme();

  const editor = monaco.editor.create(container, {
    value: '',
    language: 'plaintext',
    theme: 'restbro-notepad',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    scrollbar: {
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      useShadows: false,
    },
    // Copy as plain text only (no syntax-highlighted HTML on the clipboard).
    copyWithSyntaxHighlighting: false,
    fontSize: options.fontSize,
    lineNumbers: 'on',
    wordWrap: options.wordWrap ?? 'on',
    tabSize: options.tabSize ?? 2,
    padding: { top: 12, bottom: 12 },
    // Clean/classic JSON: no rainbow bracket-pair colorization.
    bracketPairColorization: { enabled: false },
    // Allow far more foldable regions than Monaco's default (5000) so deeply
    // nested nodes in very large JSON keep their fold/expand controls.
    foldingMaximumRegions: 65000,
    renderWhitespace: 'selection',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    tabCompletion: 'off',
    suggest: {
      preview: false,
      inlineSuggest: false,
    },
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
  });

  // Tokenize the initial viewport synchronously so the first paint is already
  // themed — avoids the white-then-colored flash / "late line" when switching
  // to a large JSON document.
  forceInitialViewportTokenization(editor);

  // Re-assert the theme and keep bracket-pair colorization disabled after the
  // first render; Monaco can re-enable colorization internally on create.
  requestAnimationFrame(() => {
    updateMonacoTheme();
    editor.updateOptions({ bracketPairColorization: { enabled: false } });
  });

  editor.onDidChangeModelContent(() => {
    callbacks.onContentChange(editor.getValue());
  });

  editor.onDidChangeCursorPosition((evt) => {
    const sel = editor.getSelection();
    const model = editor.getModel();
    let selectionLength = 0;
    if (sel && model && !sel.isEmpty()) {
      selectionLength = model.getValueLengthInRange(sel);
    }
    callbacks.onCursorChange(
      evt.position.lineNumber,
      evt.position.column,
      selectionLength
    );
  });

  // Theme changes from the rest of the app.
  document.addEventListener('theme-changed', () => {
    updateMonacoTheme();
    editor.updateOptions({ bracketPairColorization: { enabled: false } });
  });

  return editor;
}

/** Set the language for the active model. Cheap; safe to call frequently. */
export function setEditorLanguage(
  editor: monaco.editor.IStandaloneCodeEditor,
  language: string
): void {
  const model = editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, language);
  // Keep fold/expand controls permanently visible for JSON; otherwise fall
  // back to Monaco's default (icons appear only on gutter hover).
  editor.updateOptions({
    showFoldingControls: language === 'json' ? 'always' : 'mouseover',
  });
}

/** Trigger Monaco's built-in find widget. */
export function triggerFind(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.focus();
  editor.getAction('actions.find')?.run();
}

/** Trigger Monaco's built-in find & replace widget. */
export function triggerReplace(
  editor: monaco.editor.IStandaloneCodeEditor
): void {
  editor.focus();
  editor.getAction('editor.action.startFindReplaceAction')?.run();
}

/** Open Monaco's "Go to Line" prompt. */
export function triggerGoToLine(
  editor: monaco.editor.IStandaloneCodeEditor
): void {
  editor.focus();
  editor.getAction('editor.action.gotoLine')?.run();
}

/** Format the document if a formatter is registered for the active language. */
export async function formatDocument(
  editor: monaco.editor.IStandaloneCodeEditor
): Promise<void> {
  await editor.getAction('editor.action.formatDocument')?.run();
}

/** Strip trailing whitespace from every line in the active model. */
export function trimTrailingWhitespace(value: string): string {
  // Preserve the file's original line endings.
  return value.replace(/[ \t]+(\r?\n)/g, '$1').replace(/[ \t]+$/g, '');
}

/** Ensure the buffer ends with exactly one trailing newline. */
export function ensureFinalNewline(value: string): string {
  if (value.length === 0) return value;
  if (value.endsWith('\r\n') || value.endsWith('\n')) return value;
  return value + '\n';
}

/**
 * Notepad Monaco editor: theme + factory + editor-action helpers.
 */
import * as monaco from 'monaco-editor';

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
  const bracketColor = getCssHexVariable('--primary-color') || 'da70d6';
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
    fontSize: options.fontSize,
    lineNumbers: 'on',
    wordWrap: options.wordWrap ?? 'on',
    tabSize: options.tabSize ?? 2,
    padding: { top: 12, bottom: 12 },
    bracketPairColorization: { enabled: true },
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
  document.addEventListener('theme-changed', () => updateMonacoTheme());

  return editor;
}

/** Set the language for the active model. Cheap; safe to call frequently. */
export function setEditorLanguage(
  editor: monaco.editor.IStandaloneCodeEditor,
  language: string
): void {
  const model = editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, language);
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

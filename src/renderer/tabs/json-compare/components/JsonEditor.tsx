/**
 * Monaco-based JSON editor with validation and diff highlighting.
 *
 * - Theme is registered once at module scope (avoids per-mount re-registration).
 * - Validation is debounced.
 * - Decorations are applied with stable identity to avoid extra deltaDecorations work.
 * - Supports drop-file via the onDropFile prop.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as monaco from 'monaco-editor';
import type { DiffDecoration } from '../types';
import { findTextRangeForPath } from '../utils/diffMap';
import Icon from './Icon';
import './JsonEditor.css';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  decorations: DiffDecoration[];
  onValidityChange: (valid: boolean, error?: string) => void;
  onDropFile?: (file: File) => void;
}

export interface JsonEditorRef {
  revealPath: (path: string) => void;
  focusEditor: () => void;
}

let themeRegistered = false;

function readCssHex(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .replace('#', '');
}

function registerOrUpdateTheme(): void {
  const themeColor = readCssHex('--primary-color');
  const valueColor = readCssHex('--text-primary') || 'ffffff';
  const bracketColor = readCssHex('--primary-color') || 'da70d6';
  const editorBackground = readCssHex('--bg-primary') || '1a1a1a';
  const lineNumberColor = readCssHex('--json-line-number') || '6e6e6e';

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
  monaco.editor.setTheme('restbro-json');
  themeRegistered = true;
}

const JsonEditor = forwardRef<JsonEditorRef, JsonEditorProps>(
  (
    { value, onChange, label, decorations, onValidityChange, onDropFile },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const errorDecorationsRef = useRef<string[]>([]);
    const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    const [isValid, setIsValid] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const validateJson = useCallback(
      (text: string) => {
        if (!text.trim()) {
          clearErrorDecorations();
          setIsValid(true);
          setErrorMsg('');
          onValidityChange(true);
          return;
        }
        try {
          JSON.parse(text);
          clearErrorDecorations();
          setIsValid(true);
          setErrorMsg('');
          onValidityChange(true);
        } catch (err) {
          const msg = (err as Error).message;
          addErrorDecoration(msg);
          setIsValid(false);
          setErrorMsg(msg);
          onValidityChange(false, msg);
        }
      },
      [onValidityChange]
    );

    const scheduleValidate = useCallback(
      (text: string) => {
        if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
        validationTimerRef.current = setTimeout(() => validateJson(text), 200);
      },
      [validateJson]
    );

    const clearErrorDecorations = () => {
      if (!editorRef.current) return;
      errorDecorationsRef.current = editorRef.current.deltaDecorations(
        errorDecorationsRef.current,
        []
      );
    };

    const addErrorDecoration = (errorMessage: string) => {
      if (!editorRef.current) return;
      const m = errorMessage.match(/position (\d+)/);
      if (!m) {
        clearErrorDecorations();
        return;
      }
      const position = parseInt(m[1], 10);
      const model = editorRef.current.getModel();
      if (!model) return;
      const pos = model.getPositionAt(position);
      errorDecorationsRef.current = editorRef.current.deltaDecorations(
        errorDecorationsRef.current,
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
      editorRef.current.revealPositionInCenter(pos);
    };

    // ---------- mount Monaco ----------
    useEffect(() => {
      if (!containerRef.current) return;
      if (!themeRegistered) registerOrUpdateTheme();

      const editor = monaco.editor.create(containerRef.current, {
        value,
        language: 'json',
        theme: 'restbro-json',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineNumbers: 'on',
        folding: true,
        formatOnPaste: true,
        formatOnType: true,
        fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
        glyphMargin: false,
        lineDecorationsWidth: 4,
        lineNumbersMinChars: 3,
        bracketPairColorization: { enabled: false },
      });
      editorRef.current = editor;

      const changeDisposable = editor.onDidChangeModelContent(() => {
        const newValue = editor.getValue();
        onChange(newValue);
        scheduleValidate(newValue);
      });
      validateJson(value);

      const onThemeChanged = () => registerOrUpdateTheme();
      document.addEventListener('theme-changed', onThemeChanged);

      return () => {
        changeDisposable.dispose();
        editor.dispose();
        document.removeEventListener('theme-changed', onThemeChanged);
        if (validationTimerRef.current)
          clearTimeout(validationTimerRef.current);
      };
    }, []);

    // ---------- sync prop value into editor ----------
    useEffect(() => {
      if (editorRef.current && editorRef.current.getValue() !== value) {
        editorRef.current.setValue(value);
        validateJson(value);
      }
    }, [value, validateJson]);

    // ---------- apply diff decorations ----------
    useEffect(() => {
      if (!editorRef.current) return;
      const monacoDecorations = decorations.map((dec) => ({
        range: new monaco.Range(
          dec.startLine,
          dec.startColumn,
          dec.endLine,
          dec.endColumn
        ),
        options: {
          className: `diff-${dec.type}`,
          isWholeLine: false,
          inlineClassName: `diff-inline-${dec.type}`,
        },
      }));
      decorationsRef.current = editorRef.current.deltaDecorations(
        decorationsRef.current,
        monacoDecorations
      );
    }, [decorations]);

    // ---------- imperative API ----------
    useImperativeHandle(ref, () => ({
      revealPath: (path: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const model = editor.getModel();
        if (!model) return;

        const segments =
          path === ''
            ? []
            : path
                .slice(1)
                .split('/')
                .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

        if (segments.length === 0) {
          editor.revealLine(1, monaco.editor.ScrollType.Smooth);
          editor.focus();
          return;
        }

        let targetRange: monaco.Range | null = null;

        const exact = findTextRangeForPath(model.getValue(), path);
        if (exact) {
          targetRange = new monaco.Range(
            exact.startLine,
            exact.startColumn,
            exact.endLine,
            exact.endColumn
          );
        } else {
          // Fallback: key-name walk (best effort).
          const lineCount = model.getLineCount();
          let searchStartLine = 1;
          for (const seg of segments) {
            if (!isNaN(Number(seg))) continue;
            const searchRange = new monaco.Range(
              searchStartLine,
              1,
              lineCount,
              model.getLineMaxColumn(lineCount)
            );
            const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = model.findMatches(
              `"${escaped}"\\s*:`,
              searchRange,
              true,
              false,
              null,
              false
            );
            if (matches.length === 0) break;
            targetRange = matches[0].range;
            searchStartLine = targetRange.startLineNumber + 1;
          }
        }

        if (targetRange) {
          editor.revealRangeInCenter(
            targetRange,
            monaco.editor.ScrollType.Smooth
          );
          editor.setSelection(targetRange);
        }
        editor.focus();
      },
      focusEditor: () => editorRef.current?.focus(),
    }));

    // ---------- drag-drop ----------
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f && onDropFile) onDropFile(f);
    };

    return (
      <div
        className={`json-editor-wrapper ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="json-editor-header">
          <span className="editor-label">{label}</span>
          <span
            className={`validity-badge ${isValid ? 'valid' : 'invalid'}`}
            role="status"
            aria-live="polite"
            title={errorMsg || (isValid ? 'Valid JSON' : 'Invalid JSON')}
          >
            <Icon name={isValid ? 'check' : 'close'} />
            {isValid ? 'Valid' : 'Invalid'}
          </span>
        </div>
        <div ref={containerRef} className="monaco-container" />
        {isDragging && (
          <div className="json-editor-drop-overlay" aria-hidden="true">
            Drop file to load JSON
          </div>
        )}
      </div>
    );
  }
);

JsonEditor.displayName = 'JsonEditor';

export default JsonEditor;

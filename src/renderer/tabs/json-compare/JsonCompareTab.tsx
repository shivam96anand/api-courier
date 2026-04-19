/**
 * JSON Compare Tab — top-level orchestration component.
 *
 * Responsibilities:
 *  - load/persist UI state via main-process StoreManager
 *  - own the diff result via useJsonDiff (worker + inline fallback)
 *  - wire keyboard shortcuts + diff navigation
 *  - render toolbar, options panel, both editors, diff table
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JsonEditor, { JsonEditorRef } from './components/JsonEditor';
import DiffTable, { DiffTableNavApi } from './components/DiffTable';
import CompareToolbar from './components/CompareToolbar';
import CompareOptionsPanel from './components/CompareOptionsPanel';
import { useJsonDiff } from './hooks/useJsonDiff';
import { useComparePersistence } from './hooks/useComparePersistence';
import { useCompareShortcuts } from './hooks/useCompareShortcuts';
import {
  diffRowsToJsonPatch,
  diffRowsToMarkdown,
} from './utils/exportDiff';
import './styles.css';

/** Best-effort clipboard write that survives Electron sandboxes. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Trigger a browser download with the given text contents. */
function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const JsonCompareTab: React.FC = () => {
  const { loaded, state, setState } = useComparePersistence();

  const [leftValid, setLeftValid] = useState(true);
  const [rightValid, setRightValid] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const leftEditorRef = useRef<JsonEditorRef>(null);
  const rightEditorRef = useRef<JsonEditorRef>(null);
  const tableRef = useRef<DiffTableNavApi>(null);

  const compareOptions = state.options;

  const { status, result, error, workerUnavailable, compute } = useJsonDiff(
    state.leftJson,
    state.rightJson,
    leftValid,
    rightValid,
    { compareOptions }
  );

  const handleNavigate = useCallback(
    (path: string, side: 'left' | 'right') => {
      if (side === 'left') leftEditorRef.current?.revealPath(path);
      else rightEditorRef.current?.revealPath(path);
    },
    []
  );

  const handleNextDiff = useCallback(() => tableRef.current?.step(1), []);
  const handlePrevDiff = useCallback(() => tableRef.current?.step(-1), []);

  // ---------- text actions ----------
  const formatJson = (s: string): string => {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  };
  const minifyJson = (s: string): string => {
    try {
      return JSON.stringify(JSON.parse(s));
    } catch {
      return s;
    }
  };

  const setLeft = (v: string) =>
    setState((s) => ({ ...s, leftJson: v, leftTruncated: false }));
  const setRight = (v: string) =>
    setState((s) => ({ ...s, rightJson: v, rightTruncated: false }));

  // Allow other parts of the app (e.g. the response panel "Compare with"
  // dropdown) to push two payloads into this tab. Listens for a custom
  // `json-compare-load` CustomEvent with `{ left, right, leftLabel?, rightLabel? }`.
  // Also drains `window.__pendingJsonComparePayload` on mount so a payload
  // queued before this lazy-loaded tab mounted is not lost.
  useEffect(() => {
    const apply = (detail: {
      left?: unknown;
      right?: unknown;
      leftLabel?: unknown;
      rightLabel?: unknown;
    }): void => {
      const left = typeof detail.left === 'string' ? detail.left : '';
      const right = typeof detail.right === 'string' ? detail.right : '';
      const leftLabel =
        typeof detail.leftLabel === 'string' ? detail.leftLabel : undefined;
      const rightLabel =
        typeof detail.rightLabel === 'string' ? detail.rightLabel : undefined;
      setState((s) => ({
        ...s,
        leftJson: left,
        rightJson: right,
        leftTruncated: false,
        rightTruncated: false,
        leftLabel: leftLabel || s.leftLabel,
        rightLabel: rightLabel || s.rightLabel,
      }));
    };

    const handler = (e: Event): void => {
      apply(((e as CustomEvent).detail || {}) as Record<string, unknown>);
    };
    document.addEventListener('json-compare-load', handler);

    // Drain any payload queued before mount.
    const w = window as unknown as Record<string, unknown>;
    const pending = w.__pendingJsonComparePayload;
    if (pending && typeof pending === 'object') {
      apply(pending as Record<string, unknown>);
      delete w.__pendingJsonComparePayload;
    }

    return () => document.removeEventListener('json-compare-load', handler);
  }, []);

  const handleFormatBoth = () => {
    setState((s) => ({
      ...s,
      leftJson: formatJson(s.leftJson),
      rightJson: formatJson(s.rightJson),
      leftTruncated: false,
      rightTruncated: false,
    }));
  };
  const handleMinifyBoth = () => {
    setState((s) => ({
      ...s,
      leftJson: minifyJson(s.leftJson),
      rightJson: minifyJson(s.rightJson),
      leftTruncated: false,
      rightTruncated: false,
    }));
  };
  const handleSortKeysToggle = () => {
    setState((s) => ({
      ...s,
      options: { ...(s.options || {}), sortKeys: !s.options?.sortKeys },
    }));
  };

  useCompareShortcuts({
    onCompare: compute,
    onNextDiff: handleNextDiff,
    onPrevDiff: handlePrevDiff,
    onFormatBoth: handleFormatBoth,
  });

  // ---------- export ----------
  const openExportMenu = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setExportMenu({ x: rect.right, y: rect.bottom + 6 });
  }, []);

  const showToast = useCallback((msg: string) => {
    setExportToast(msg);
    setTimeout(() => setExportToast(null), 2200);
  }, []);

  const buildExportPayload = useCallback(
    (kind: 'patch' | 'markdown'): { text: string; mime: string; ext: string } => {
      if (!result) return { text: '', mime: 'text/plain', ext: 'txt' };
      if (kind === 'markdown') {
        return {
          text: diffRowsToMarkdown(result.rows, {
            leftLabel: state.leftLabel,
            rightLabel: state.rightLabel,
          }),
          mime: 'text/markdown',
          ext: 'md',
        };
      }
      return {
        text: JSON.stringify(diffRowsToJsonPatch(result.rows), null, 2),
        mime: 'application/json',
        ext: 'json',
      };
    },
    [result, state.leftLabel, state.rightLabel]
  );

  const handleExportCopy = useCallback(
    async (kind: 'patch' | 'markdown') => {
      const { text } = buildExportPayload(kind);
      if (!text) return;
      const ok = await copyText(text);
      setExportMenu(null);
      showToast(
        ok
          ? `Copied ${kind === 'patch' ? 'JSON Patch' : 'Markdown'} to clipboard`
          : 'Copy failed — try Save to file instead'
      );
    },
    [buildExportPayload, showToast]
  );

  const handleExportDownload = useCallback(
    (kind: 'patch' | 'markdown') => {
      const { text, mime, ext } = buildExportPayload(kind);
      if (!text) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadText(`json-diff-${stamp}.${ext}`, text, mime);
      setExportMenu(null);
      showToast(`Saved ${kind === 'patch' ? 'JSON Patch' : 'Markdown'} file`);
    },
    [buildExportPayload, showToast]
  );

  // Close export menu on outside click / Escape.
  useEffect(() => {
    if (!exportMenu) return;
    const onDocClick = (ev: MouseEvent): void => {
      const target = ev.target as Element | null;
      if (target && target.closest('.export-menu')) return;
      setExportMenu(null);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setExportMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenu]);

  // ---------- file drop ----------
  const readFile = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error);
      r.readAsText(f);
    });

  const onDropLeft = useCallback(async (f: File) => {
    const text = await readFile(f);
    setLeft(text);
  }, []);
  const onDropRight = useCallback(async (f: File) => {
    const text = await readFile(f);
    setRight(text);
  }, []);

  // ---------- derived ----------
  const stats = result?.stats;
  const totalDiffs = result?.rows.length ?? 0;
  const diffTime = stats?.totalTime ?? 0;
  const identical =
    leftValid &&
    rightValid &&
    state.leftJson.trim() !== '' &&
    state.rightJson.trim() !== '' &&
    status === 'success' &&
    totalDiffs === 0;

  const decorationsLeft = useMemo(
    () => result?.leftDecorations || [],
    [result?.leftDecorations]
  );
  const decorationsRight = useMemo(
    () => result?.rightDecorations || [],
    [result?.rightDecorations]
  );

  if (!loaded) return null;

  return (
    <div className="json-compare-container">
      <CompareToolbar
        stats={stats}
        totalDiffs={totalDiffs}
        diffTime={diffTime}
        workerUnavailable={workerUnavailable}
        truncated={{
          left: state.leftTruncated,
          right: state.rightTruncated,
        }}
        identical={identical}
        onSwap={() =>
          setState((s) => ({
            ...s,
            leftJson: s.rightJson,
            rightJson: s.leftJson,
          }))
        }
        onClear={() =>
          setState((s) => ({ ...s, leftJson: '', rightJson: '' }))
        }
        onCopyLeft={() => {
          void copyText(state.leftJson).then((ok) =>
            showToast(ok ? 'Left JSON copied' : 'Copy failed')
          );
        }}
        onCopyRight={() => {
          void copyText(state.rightJson).then((ok) =>
            showToast(ok ? 'Right JSON copied' : 'Copy failed')
          );
        }}
        onFormatBoth={handleFormatBoth}
        onMinifyBoth={handleMinifyBoth}
        onSortKeysToggle={handleSortKeysToggle}
        sortKeysActive={!!compareOptions?.sortKeys}
        onToggleOptions={() => setOptionsOpen((o) => !o)}
        optionsOpen={optionsOpen}
        onExportMenu={openExportMenu}
        exportDisabled={!result || result.rows.length === 0}
      />

      {exportMenu && (
        <div
          className="export-menu"
          role="menu"
          aria-label="Export diff"
          style={{
            position: 'fixed',
            top: exportMenu.y,
            left: Math.max(8, exportMenu.x - 240),
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => handleExportCopy('patch')}
          >
            <span className="export-menu-title">Copy as JSON Patch</span>
            <span className="export-menu-sub">RFC 6902 — to clipboard</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => handleExportCopy('markdown')}
          >
            <span className="export-menu-title">Copy as Markdown</span>
            <span className="export-menu-sub">Table — to clipboard</span>
          </button>
          <div className="export-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => handleExportDownload('patch')}
          >
            <span className="export-menu-title">Save JSON Patch…</span>
            <span className="export-menu-sub">Download .json file</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => handleExportDownload('markdown')}
          >
            <span className="export-menu-title">Save Markdown…</span>
            <span className="export-menu-sub">Download .md file</span>
          </button>
        </div>
      )}

      {exportToast && (
        <div className="export-toast" role="status" aria-live="polite">
          {exportToast}
        </div>
      )}

      {optionsOpen && (
        <CompareOptionsPanel
          options={compareOptions || {}}
          onChange={(next) =>
            setState((s) => ({ ...s, options: { ...s.options, ...next } }))
          }
        />
      )}

      <div className="json-compare-body">
        <div className="editors-container">
          <div className="editor-pane">
            <JsonEditor
              ref={leftEditorRef}
              value={state.leftJson}
              onChange={setLeft}
              label={state.leftLabel || 'Left'}
              decorations={decorationsLeft}
              onValidityChange={setLeftValid}
              onDropFile={onDropLeft}
            />
          </div>
          <div className="editor-pane">
            <JsonEditor
              ref={rightEditorRef}
              value={state.rightJson}
              onChange={setRight}
              label={state.rightLabel || 'Right'}
              decorations={decorationsRight}
              onValidityChange={setRightValid}
              onDropFile={onDropRight}
            />
          </div>
        </div>

        <div className="diff-table-container">
          {!leftValid || !rightValid ? (
            <div className="empty-state">
              <p>Fix JSON errors to see differences</p>
            </div>
          ) : status === 'error' ? (
            <div className="empty-state empty-state--error">
              <p>Compare failed: {error || 'Unknown error'}</p>
            </div>
          ) : identical ? (
            <div className="empty-state empty-state--success">
              <p>✓ Both documents are identical</p>
            </div>
          ) : (
            <DiffTable
              ref={tableRef}
              rows={result?.rows || []}
              onNavigate={handleNavigate}
              searchFilter={state.tableFilter}
              onSearchFilterChange={(v) =>
                setState((s) => ({ ...s, tableFilter: v }))
              }
              valueFilter={state.valueFilter || ''}
              onValueFilterChange={(v) =>
                setState((s) => ({ ...s, valueFilter: v }))
              }
              selectedTypes={state.selectedTypes}
              onSelectedTypesChange={(types) =>
                setState((s) => ({ ...s, selectedTypes: types }))
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default JsonCompareTab;

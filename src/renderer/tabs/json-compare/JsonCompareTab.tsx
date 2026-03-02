/**
 * Main JSON Compare Tab component
 * Layout: editors on top (split), diff table below
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import JsonEditor, { JsonEditorRef } from './components/JsonEditor';
import DiffTable from './components/DiffTable';
import { useJsonDiff } from './hooks/useJsonDiff';
import { loadCompareState, saveCompareState } from './state/persist';
import './styles.css';

const JsonCompareTab: React.FC = () => {
  const [leftJson, setLeftJson] = useState('');
  const [rightJson, setRightJson] = useState('');
  const [leftValid, setLeftValid] = useState(true);
  const [rightValid, setRightValid] = useState(true);

  const leftEditorRef = useRef<JsonEditorRef>(null);
  const rightEditorRef = useRef<JsonEditorRef>(null);

  const { status, result, error, compute } = useJsonDiff(leftJson, rightJson, leftValid, rightValid);

  // Load persisted state on mount
  useEffect(() => {
    const state = loadCompareState();
    setLeftJson(state.leftJson);
    setRightJson(state.rightJson);
  }, []);

  // Save state on changes (debounced via effect)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCompareState({
        leftJson,
        rightJson,
        tableFilter: '',
        selectedTypes: ['added', 'removed', 'changed']
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [leftJson, rightJson]);

  // Handlers
  const handleSwap = () => {
    const temp = leftJson;
    setLeftJson(rightJson);
    setRightJson(temp);
  };

  const handleClear = () => {
    setLeftJson('');
    setRightJson('');
  };

  const handleCopyLeft = () => {
    navigator.clipboard.writeText(leftJson);
  };

  const handleCopyRight = () => {
    navigator.clipboard.writeText(rightJson);
  };

  const handleNavigate = useCallback((path: string, side: 'left' | 'right') => {
    if (side === 'left') {
      leftEditorRef.current?.revealPath(path);
    } else {
      rightEditorRef.current?.revealPath(path);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Enter to force compare
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        compute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [compute]);

  const diffCount = result?.rows.length || 0;
  const stats = result?.stats;
  const diffTime = stats?.totalTime || 0;

  return (
    <div className="json-compare-container">
      <div className="json-compare-header">
        <div className="header-row">
          <div className="title-stack">
            <h3 className="header-title">JSON Compare</h3>
          </div>

          <div className="mini-metric-grid">
            <div className="mini-metric-card accent-primary">
              <span className="metric-label">Total</span>
              <span className="metric-value">{diffCount}</span>
            </div>
            <div className="mini-metric-card accent-changed">
              <span className="metric-label">Changed</span>
              <span className="metric-value">{stats?.changed ?? 0}</span>
            </div>
            <div className="mini-metric-card accent-removed">
              <span className="metric-label">Removed</span>
              <span className="metric-value">{stats?.removed ?? 0}</span>
            </div>
            <div className="mini-metric-card accent-added">
              <span className="metric-label">Added</span>
              <span className="metric-value">{stats?.added ?? 0}</span>
            </div>
          </div>

          <div className="header-actions">
            <button className="compare-action-btn" onClick={handleSwap} title="Swap sides">
              <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7h10M13 3l4 4-4 4M17 17H7M11 13l-4 4 4 4" />
              </svg>
              Swap
            </button>
            <button className="compare-action-btn" onClick={handleClear} title="Clear both editors">
              <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
              Clear
            </button>
            <button className="compare-action-btn" onClick={handleCopyLeft} title="Copy left JSON">
              <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8h10v10H8z" />
                <path d="M6 6h10v10" />
              </svg>
              Copy left
            </button>
            <button className="compare-action-btn" onClick={handleCopyRight} title="Copy right JSON">
              <svg className="ui-icon ui-icon--sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8h10v10H8z" />
                <path d="M6 6h10v10" />
              </svg>
              Copy right
            </button>
          </div>
        </div>
      </div>

      <div className="json-compare-body">
        <div className="editors-container">
          <div className="editor-pane">
            <JsonEditor
              ref={leftEditorRef}
              value={leftJson}
              onChange={setLeftJson}
              label="Left JSON (Original)"
              decorations={result?.leftDecorations || []}
              onValidityChange={(valid) => {
                setLeftValid(valid);
              }}
            />
          </div>
          <div className="editor-pane">
            <JsonEditor
              ref={rightEditorRef}
              value={rightJson}
              onChange={setRightJson}
              label="Right JSON (Comparison)"
              decorations={result?.rightDecorations || []}
              onValidityChange={(valid) => {
                setRightValid(valid);
              }}
            />
          </div>
        </div>

        <div className="diff-table-container">
          {(!leftValid || !rightValid) ? (
            <div className="empty-state">
              <p>Fix JSON errors to see differences</p>
            </div>
          ) : (status === 'error') ? (
            <div className="empty-state">
              <p>Compare failed: {error || 'Unknown error'}</p>
            </div>
          ) : (
            <DiffTable rows={result?.rows || []} onNavigate={handleNavigate} />
          )}
        </div>
      </div>
    </div>
  );
};

export default JsonCompareTab;

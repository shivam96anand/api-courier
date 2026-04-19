/**
 * JSON Compare toolbar: header title, metric chips, action buttons.
 *
 * Stateless — receives all data and callbacks via props.
 */
import React from 'react';
import Icon from './Icon';
import type { DiffStats } from '../types';

interface CompareToolbarProps {
  stats?: DiffStats | null;
  totalDiffs: number;
  diffTime: number;
  workerUnavailable: boolean;
  truncated: { left?: boolean; right?: boolean };
  identical: boolean;
  onSwap: () => void;
  onClear: () => void;
  onCopyLeft: () => void;
  onCopyRight: () => void;
  onFormatBoth: () => void;
  onMinifyBoth: () => void;
  onSortKeysToggle: () => void;
  sortKeysActive: boolean;
  onToggleOptions: () => void;
  optionsOpen: boolean;
  onExportMenu: (e: React.MouseEvent) => void;
  exportDisabled: boolean;
}

const CompareToolbar: React.FC<CompareToolbarProps> = ({
  stats,
  totalDiffs,
  diffTime,
  workerUnavailable,
  truncated,
  identical,
  onSwap,
  onClear,
  onCopyLeft,
  onCopyRight,
  onFormatBoth,
  onMinifyBoth,
  onSortKeysToggle,
  sortKeysActive,
  onToggleOptions,
  optionsOpen,
  onExportMenu,
  exportDisabled,
}) => {
  return (
    <div className="json-compare-header">
      <div className="header-row">
        <div className="title-stack">
          <h3 className="header-title">JSON Compare</h3>
          <span
            className="header-subtitle"
            aria-live="polite"
            title="Computation time and worker status"
          >
            {identical ? (
              <>Documents are identical</>
            ) : diffTime > 0 ? (
              <>Compared in {diffTime.toFixed(0)} ms</>
            ) : (
              <>Paste JSON on both sides to compare</>
            )}
            {workerUnavailable && (
              <span className="status-pill status-pill--warn" title="Background worker unavailable; large diffs may briefly freeze the UI">
                Inline mode
              </span>
            )}
            {(truncated.left || truncated.right) && (
              <span className="status-pill status-pill--warn" title="JSON exceeded the persistence cap; only a prefix was restored">
                Restored truncated
              </span>
            )}
          </span>
        </div>

        <div className="mini-metric-grid">
          <div className="mini-metric-card accent-primary">
            <span className="metric-label">Total</span>
            <span className="metric-value">{totalDiffs}</span>
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
          <button
            className="compare-action-btn"
            onClick={onFormatBoth}
            title="Pretty-print both editors (Cmd/Ctrl+Shift+F)"
            aria-label="Format both"
          >
            <Icon name="format" /> Format
          </button>
          <button
            className="compare-action-btn"
            onClick={onMinifyBoth}
            title="Minify both editors"
            aria-label="Minify both"
          >
            <Icon name="minify" /> Minify
          </button>
          <button
            className={`compare-action-btn ${sortKeysActive ? 'is-active' : ''}`}
            onClick={onSortKeysToggle}
            title="Sort object keys before diffing (canonicalize)"
            aria-pressed={sortKeysActive}
          >
            <Icon name="sort" /> Sort keys
          </button>
          <button
            className="compare-action-btn"
            onClick={onSwap}
            title="Swap sides"
            aria-label="Swap sides"
          >
            <Icon name="swap" /> Swap
          </button>
          <button
            className="compare-action-btn"
            onClick={onClear}
            title="Clear both editors"
            aria-label="Clear both"
          >
            <Icon name="clear" /> Clear
          </button>
          <button
            className="compare-action-btn"
            onClick={onCopyLeft}
            title="Copy left JSON"
            aria-label="Copy left JSON"
          >
            <Icon name="copy" /> Copy left
          </button>
          <button
            className="compare-action-btn"
            onClick={onCopyRight}
            title="Copy right JSON"
            aria-label="Copy right JSON"
          >
            <Icon name="copy" /> Copy right
          </button>
          <button
            className="compare-action-btn"
            onClick={onExportMenu}
            disabled={exportDisabled}
            title="Export diff (JSON Patch / Markdown)"
            aria-label="Export diff"
          >
            <Icon name="download" /> Export
          </button>
          <button
            className={`compare-action-btn ${optionsOpen ? 'is-active' : ''}`}
            onClick={onToggleOptions}
            title="Comparison options"
            aria-pressed={optionsOpen}
            aria-label="Comparison options"
          >
            <Icon name="cog" /> Options
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompareToolbar;

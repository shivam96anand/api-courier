/**
 * Virtualized table component for displaying JSON differences.
 *
 * - Controlled filter state (lifted to parent so it can be persisted).
 * - Type-filter buttons show counts and aria-pressed for a11y.
 * - Path AND value keyword search.
 * - SAFE: no dangerouslySetInnerHTML — values render as React nodes.
 * - Long values are truncated for the row; click the row to expand a
 *   details panel above the list.
 * - Exposes a navigation API via ref for prev/next-diff shortcuts.
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FixedSizeList as VirtualList } from 'react-window';
import type { DiffRow, DiffChangeType } from '../types';
import Icon from './Icon';
import './DiffTable.css';

export interface DiffTableNavApi {
  /** Navigate to the diff at offset (1 = next, -1 = prev). Wraps around. */
  step: (offset: number) => void;
  /** Total filtered rows. */
  filteredCount: () => number;
  /** Current selected filtered index (-1 if none). */
  currentIndex: () => number;
}

interface DiffTableProps {
  rows: DiffRow[];
  onNavigate: (path: string, side: 'left' | 'right') => void;
  searchFilter: string;
  onSearchFilterChange: (s: string) => void;
  valueFilter: string;
  onValueFilterChange: (s: string) => void;
  selectedTypes: DiffChangeType[];
  onSelectedTypesChange: (t: DiffChangeType[]) => void;
  /** Called when selection moves (for in-editor sync). */
  onSelectionChange?: (row: DiffRow | null) => void;
}

const ROW_HEIGHT = 60;
const VALUE_MAX_CHARS = 240;

const DiffTable = forwardRef<DiffTableNavApi, DiffTableProps>(
  (
    {
      rows,
      onNavigate,
      searchFilter,
      onSearchFilterChange,
      valueFilter,
      onValueFilterChange,
      selectedTypes,
      onSelectedTypesChange,
      onSelectionChange,
    },
    ref
  ) => {
    const listViewportRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<VirtualList | null>(null);
    const [listViewportHeight, setListViewportHeight] = useState(ROW_HEIGHT * 5);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [expandedIdx, setExpandedIdx] = useState(-1);

    // Counts per type (across ALL rows, regardless of current filter).
    const typeCounts = useMemo(() => {
      const c: Record<DiffChangeType, number> = {
        added: 0,
        removed: 0,
        changed: 0,
      };
      for (const r of rows) c[r.type]++;
      return c;
    }, [rows]);

    const matchesPathKeywords = (path: string, raw: string) => {
      const keywords = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (keywords.length === 0) return true;
      const p = path.toLowerCase();
      return keywords.every((k) => p.includes(k));
    };

    const matchesValueSearch = (row: DiffRow, raw: string) => {
      const q = raw.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${stringifySafe(row.leftValue)}\n${stringifySafe(row.rightValue)}`.toLowerCase();
      return haystack.includes(q);
    };

    const filteredRows = useMemo(() => {
      return rows.filter((row) => {
        if (!selectedTypes.includes(row.type)) return false;
        if (!matchesPathKeywords(row.path || '', searchFilter)) return false;
        if (!matchesValueSearch(row, valueFilter)) return false;
        return true;
      });
    }, [rows, searchFilter, valueFilter, selectedTypes]);

    // Reset selection when filters or data change in a way that invalidates it.
    useEffect(() => {
      if (selectedIdx >= filteredRows.length) {
        setSelectedIdx(filteredRows.length > 0 ? 0 : -1);
        setExpandedIdx(-1);
      }
    }, [filteredRows, selectedIdx]);

    useEffect(() => {
      onSelectionChange?.(
        selectedIdx >= 0 ? filteredRows[selectedIdx] || null : null
      );
    }, [selectedIdx, filteredRows, onSelectionChange]);

    useEffect(() => {
      const el = listViewportRef.current;
      if (!el) return;
      const update = () => {
        const h = Math.floor(el.clientHeight);
        if (h > 0) setListViewportHeight(h);
      };
      update();
      if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
      }
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        step: (offset: number) => {
          if (filteredRows.length === 0) return;
          const next =
            ((selectedIdx === -1 ? 0 : selectedIdx + offset) +
              filteredRows.length) %
            filteredRows.length;
          setSelectedIdx(next);
          listRef.current?.scrollToItem(next, 'smart');
          // Auto-navigate the editor on the side that has a value.
          const row = filteredRows[next];
          if (row.type === 'added') onNavigate(row.path, 'right');
          else onNavigate(row.path, 'left');
        },
        filteredCount: () => filteredRows.length,
        currentIndex: () => selectedIdx,
      }),
      [filteredRows, selectedIdx, onNavigate]
    );

    const toggleType = (type: DiffChangeType) => {
      if (selectedTypes.includes(type)) {
        if (selectedTypes.length > 1) {
          onSelectedTypesChange(selectedTypes.filter((t) => t !== type));
        }
      } else {
        onSelectedTypesChange([...selectedTypes, type]);
      }
    };

    const copyPath = (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(path);
    };

    const handleRowClick = (index: number) => {
      setSelectedIdx(index);
    };

    const handleRowDoubleClick = (index: number, side: 'left' | 'right') => {
      const row = filteredRows[index];
      if (!row) return;
      onNavigate(row.path, side);
    };

    const toggleExpand = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedIdx((cur) => (cur === index ? -1 : index));
      setSelectedIdx(index);
    };

    const expandedRow =
      expandedIdx >= 0 ? filteredRows[expandedIdx] || null : null;

    const Row = ({
      index,
      style,
    }: {
      index: number;
      style: React.CSSProperties;
    }) => {
      const row = filteredRows[index];
      const leftDisabled = row.type === 'added';
      const rightDisabled = row.type === 'removed';
      const isSelected = index === selectedIdx;
      const isExpanded = index === expandedIdx;

      return (
        <div
          style={style}
          className={`diff-row ${isSelected ? 'is-selected' : ''} ${isExpanded ? 'is-expanded' : ''}`}
          onClick={() => handleRowClick(index)}
        >
          <div className="diff-cell path-cell">
            <button
              className="row-expand-btn"
              onClick={(e) => toggleExpand(index, e)}
              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
              aria-expanded={isExpanded}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
            </button>
            <span className="path-text" title={row.path || '/'}>
              {row.path || '/'}
            </span>
            <button
              className="copy-path-btn"
              onClick={(e) => copyPath(row.path, e)}
              title="Copy path"
              aria-label="Copy path"
            >
              <Icon name="copy" />
            </button>
          </div>
          <div className="diff-cell type-cell">
            <span className={`type-badge ${typeBadgeClass(row.type)}`} aria-label={row.type}>
              {typeLabel(row.type)}
            </span>
          </div>
          <ValueCell
            value={row.leftValue}
            disabled={leftDisabled}
            onJump={() => !leftDisabled && onNavigate(row.path, 'left')}
            onDoubleClick={() => handleRowDoubleClick(index, 'left')}
            side="left"
          />
          <ValueCell
            value={row.rightValue}
            disabled={rightDisabled}
            onJump={() => !rightDisabled && onNavigate(row.path, 'right')}
            onDoubleClick={() => handleRowDoubleClick(index, 'right')}
            side="right"
          />
        </div>
      );
    };

    const contentHeight = filteredRows.length * ROW_HEIGHT;
    const listHeight = Math.max(
      ROW_HEIGHT,
      Math.min(contentHeight || ROW_HEIGHT, listViewportHeight)
    );

    return (
      <div className="diff-table-wrapper">
        <div className="diff-table-controls">
          <input
            type="text"
            placeholder="Filter by path keywords…"
            className="filter-input"
            value={searchFilter}
            onChange={(e) => onSearchFilterChange(e.target.value)}
            aria-label="Filter by path"
          />
          <input
            type="text"
            placeholder="Search in values…"
            className="filter-input filter-input--value"
            value={valueFilter}
            onChange={(e) => onValueFilterChange(e.target.value)}
            aria-label="Search in values"
          />
          <div className="type-filters" role="group" aria-label="Change type filter">
            {(['added', 'removed', 'changed'] as DiffChangeType[]).map((t) => {
              const active = selectedTypes.includes(t);
              return (
                <button
                  key={t}
                  className={`type-filter-btn type-filter-btn--${t} ${active ? 'active' : ''}`}
                  onClick={() => toggleType(t)}
                  aria-pressed={active}
                  title={`${active ? 'Hide' : 'Show'} ${t} (${typeCounts[t]})`}
                >
                  {t.toUpperCase()}
                  <span className="type-filter-count">{typeCounts[t]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {expandedRow && (
          <ExpandedDetails
            row={expandedRow}
            onClose={() => setExpandedIdx(-1)}
          />
        )}

        <div className="diff-table-header" role="row">
          <div className="header-cell path-header">Path</div>
          <div className="header-cell type-header">Change</div>
          <div className="header-cell value-header">Left value</div>
          <div className="header-cell value-header">Right value</div>
        </div>

        <div className="diff-table-list-viewport" ref={listViewportRef}>
          {filteredRows.length > 0 ? (
            <VirtualList
              ref={(el) => {
                listRef.current = el;
              }}
              height={listHeight}
              itemCount={filteredRows.length}
              itemSize={ROW_HEIGHT}
              width="100%"
              overscanCount={6}
            >
              {Row}
            </VirtualList>
          ) : (
            <div className="empty-table-state">
              <p>
                {rows.length === 0
                  ? '✓ No differences found — documents are identical'
                  : 'No matches for current filters'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

DiffTable.displayName = 'DiffTable';

export default DiffTable;

// ---------- helpers ----------

function typeLabel(t: DiffChangeType): string {
  return t === 'added' ? 'Added' : t === 'removed' ? 'Removed' : 'Changed';
}

function typeBadgeClass(t: DiffChangeType): string {
  return `type-badge-${t}`;
}

function stringifySafe(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatForCell(value: unknown): { text: string; truncated: boolean } {
  if (value === undefined) return { text: '(empty)', truncated: false };
  if (value === null) return { text: 'null', truncated: false };
  if (typeof value === 'string') {
    const t = `"${value}"`;
    return t.length > VALUE_MAX_CHARS
      ? { text: t.slice(0, VALUE_MAX_CHARS) + '…', truncated: true }
      : { text: t, truncated: false };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), truncated: false };
  }
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    json = String(value);
  }
  return json.length > VALUE_MAX_CHARS
    ? { text: json.slice(0, VALUE_MAX_CHARS) + '…', truncated: true }
    : { text: json, truncated: false };
}

interface ValueCellProps {
  value: unknown;
  disabled: boolean;
  side: 'left' | 'right';
  onJump: () => void;
  onDoubleClick: () => void;
}
const ValueCell: React.FC<ValueCellProps> = ({
  value,
  disabled,
  side,
  onJump,
  onDoubleClick,
}) => {
  const { text, truncated } = formatForCell(value);
  return (
    <div
      className={`diff-cell value-cell ${side} ${disabled ? 'disabled' : 'clickable'}`}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onJump();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!disabled) onDoubleClick();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onJump();
        }
      }}
      title={truncated ? 'Click "Expand" to see the full value' : undefined}
    >
      {/* Plain text — NEVER innerHTML. */}
      <pre className="value-text">{text}</pre>
      {!disabled && <span className="jump-pill">Navigate</span>}
    </div>
  );
};

interface ExpandedDetailsProps {
  row: DiffRow;
  onClose: () => void;
}
const ExpandedDetails: React.FC<ExpandedDetailsProps> = ({ row, onClose }) => {
  const fmt = (v: unknown) => {
    if (v === undefined) return '(empty)';
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };
  return (
    <div className="diff-details-panel" role="region" aria-label="Diff details">
      <div className="diff-details-header">
        <span className={`type-badge ${typeBadgeClass(row.type)}`}>
          {typeLabel(row.type)}
        </span>
        <code className="diff-details-path" title={row.path || '/'}>
          {row.path || '/'}
        </code>
        <button
          className="diff-details-close"
          onClick={onClose}
          aria-label="Close details"
          title="Close"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="diff-details-body">
        <div className="diff-details-side">
          <span className="diff-details-side-label">Left</span>
          <pre>{fmt(row.leftValue)}</pre>
        </div>
        <div className="diff-details-side">
          <span className="diff-details-side-label">Right</span>
          <pre>{fmt(row.rightValue)}</pre>
        </div>
      </div>
    </div>
  );
};

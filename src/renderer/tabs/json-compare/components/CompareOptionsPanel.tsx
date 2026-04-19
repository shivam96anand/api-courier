/**
 * Collapsible options panel: ignore-array-order, case-insensitive,
 * ignore-string-whitespace, ignore-paths.
 */
import React from 'react';
import type { JsonCompareOptions } from '../../../../shared/types';

interface CompareOptionsPanelProps {
  options: JsonCompareOptions;
  onChange: (next: JsonCompareOptions) => void;
}

const CompareOptionsPanel: React.FC<CompareOptionsPanelProps> = ({
  options,
  onChange,
}) => {
  const ignorePathsText = (options.ignorePaths || []).join('\n');

  const setIgnorePaths = (text: string) => {
    const list = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...options, ignorePaths: list });
  };

  return (
    <div className="compare-options-panel" role="region" aria-label="Comparison options">
      <div className="options-row">
        <label className="option-toggle">
          <input
            type="checkbox"
            checked={!!options.ignoreArrayOrder}
            onChange={(e) =>
              onChange({ ...options, ignoreArrayOrder: e.target.checked })
            }
          />
          <span>Ignore array order</span>
        </label>
        <label className="option-toggle">
          <input
            type="checkbox"
            checked={!!options.caseInsensitive}
            onChange={(e) =>
              onChange({ ...options, caseInsensitive: e.target.checked })
            }
          />
          <span>Case-insensitive strings</span>
        </label>
        <label className="option-toggle">
          <input
            type="checkbox"
            checked={!!options.ignoreStringWhitespace}
            onChange={(e) =>
              onChange({ ...options, ignoreStringWhitespace: e.target.checked })
            }
          />
          <span>Ignore string whitespace</span>
        </label>
      </div>
      <div className="options-row options-row--ignore-paths">
        <label className="ignore-paths-label" htmlFor="ignore-paths-textarea">
          Ignore paths (one per line; supports <code>*</code> and <code>**</code>)
        </label>
        <textarea
          id="ignore-paths-textarea"
          className="ignore-paths-textarea"
          value={ignorePathsText}
          onChange={(e) => setIgnorePaths(e.target.value)}
          placeholder={'/audit/**\n/users/*/createdAt\n/*/etag'}
          spellCheck={false}
          rows={3}
        />
      </div>
    </div>
  );
};

export default CompareOptionsPanel;

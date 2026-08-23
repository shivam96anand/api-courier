/**
 * Styles for the Manage Environments dialog.
 *
 * Compact, table-driven layout:
 *  - The dialog sizes to its content up to a cap, so a handful of variables
 *    doesn't leave a stretched, half-empty panel.
 *  - The variables table gives the VALUE column the dominant width because
 *    values (URLs, tokens) are the most important field to read.
 */

// Shared column template for the variable tables.
// Value stays dominant (URLs/tokens) while Description gets enough room to read.
// Columns: Key | Value | Description | Type (secret toggle) | delete.
const VAR_GRID =
  'minmax(104px, 0.78fr) minmax(230px, 1.85fr) minmax(120px, 1fr) 98px 26px';

export class EnvironmentDialogStyles {
  static readonly overlay = `
    position: fixed;
    inset: 0;
    background: radial-gradient(120% 120% at 20% 0%, rgba(var(--primary-color-rgb), 0.14), transparent 50%),
                rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px) saturate(115%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
    animation: restbroEnvFade 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  static readonly dialog = `
    background: linear-gradient(160deg,
                rgba(var(--primary-color-rgb), 0.09) 0%,
                rgba(20, 22, 26, 0.98) 28%,
                var(--bg-secondary) 100%);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    width: min(1120px, 94vw);
    min-height: 400px;
    max-height: min(88vh, 760px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58),
                0 10px 26px rgba(0, 0, 0, 0.32),
                0 0 0 1px rgba(255, 255, 255, 0.03);
    animation: restbroEnvSlide 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  static readonly header = `
    flex: 0 0 auto;
    padding: 11px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(135deg,
                rgba(var(--primary-color-rgb), 0.07) 0%,
                rgba(var(--primary-color-rgb), 0.02) 100%);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  `;

  static readonly title = `
    margin: 0;
    color: rgba(255, 255, 255, 0.96);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  `;

  static readonly buttonsContainer = `
    display: flex;
    gap: 8px;
    align-items: center;
  `;

  static readonly deleteAllButton = `
    padding: 5px 11px;
    background: rgba(var(--error-color-rgb), 0.1);
    border: 1px solid rgba(var(--error-color-rgb), 0.35);
    border-radius: 7px;
    color: var(--error-color);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.18s ease;
  `;

  static readonly addButton = `
    padding: 5px 12px;
    background: linear-gradient(135deg, var(--primary-color) 0%, rgba(var(--primary-color-rgb), 0.82) 100%);
    border: none;
    border-radius: 7px;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.01em;
    transition: all 0.18s ease;
    box-shadow: 0 3px 10px rgba(var(--primary-color-rgb), 0.32);
  `;

  static readonly body = `
    flex: 1 1 auto;
    min-height: 0;
    padding: 11px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  `;

  // Row holding the tab pills (left) and the Delete/Close actions (right).
  static readonly tabsRow = `
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `;

  static readonly headerActions = `
    display: inline-flex;
    align-items: center;
    gap: 8px;
  `;

  static readonly tabsContainer = `
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.22);
  `;

  static getTabStyle(isActive: boolean): string {
    return `
      padding: 4px 13px;
      background: ${
        isActive
          ? 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.32) 0%, rgba(var(--primary-color-rgb), 0.16) 100%)'
          : 'transparent'
      };
      border: 1px solid ${isActive ? 'rgba(var(--primary-color-rgb), 0.45)' : 'transparent'};
      border-radius: 6px;
      color: ${isActive ? 'var(--text-primary)' : 'var(--text-secondary)'};
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.18s ease;
    `;
  }

  // Two-column workspace that fills the remaining dialog height.
  static readonly layout = `
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: 214px 1fr;
    gap: 12px;
  `;

  static readonly emptyState = `
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-secondary);
    text-align: center;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.2);
  `;

  /* ---------- Left panel: environment list ---------- */

  static readonly envList = `
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-height: 0;
  `;

  static readonly envListHeader = `
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.015);
  `;

  static readonly envListTitle = `
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  `;

  static readonly envListCount = `
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    padding: 1px 7px;
  `;

  static readonly envListBody = `
    flex: 1 1 auto;
    min-height: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow-y: auto;
  `;

  static getEnvItemStyle(isSelected: boolean): string {
    return `
      padding: 5px 9px;
      border: 1px solid ${isSelected ? 'rgba(var(--primary-color-rgb), 0.45)' : 'rgba(255, 255, 255, 0.05)'};
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      background: ${
        isSelected
          ? 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.16) 0%, rgba(0, 0, 0, 0.22) 100%)'
          : 'rgba(0, 0, 0, 0.18)'
      };
      box-shadow: ${isSelected ? 'inset 2px 0 0 var(--primary-color)' : 'none'};
      transition: all 0.18s ease;
    `;
  }

  static readonly envNameSpan = `
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;

  static readonly envMeta = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  `;

  static readonly activeBadge = `
    background: rgba(var(--success-color-rgb), 0.15);
    color: var(--success-color);
    border: 1px solid rgba(var(--success-color-rgb), 0.35);
    border-radius: 999px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: 600;
  `;

  static readonly setActiveButton = `
    padding: 3px 10px;
    background: rgba(var(--primary-color-rgb), 0.12);
    border: 1px solid rgba(var(--primary-color-rgb), 0.4);
    border-radius: 999px;
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
  `;

  /* ---------- Right panel: environment details ---------- */

  static readonly envDetails = `
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 12px 12px 10px;
    background: rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  `;

  static readonly detailHeader = `
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  `;

  static readonly detailTitle = `
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
  `;

  static readonly nameField = `
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  // Name input + per-environment actions (Set Active / Duplicate) on one line.
  static readonly nameRow = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  static readonly label = `
    display: block;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  `;

  static readonly nameInput = `
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.24);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 7px;
    color: var(--text-primary);
    font-size: 13px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  `;

  /* ---------- Variables table (shared by env + globals) ---------- */

  static readonly varsSection = `
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  static readonly varsHeader = `
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;

  static readonly varsTitle = `
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  `;

  static readonly varsCount = `
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  `;

  // Scroll container that holds the sticky header + rows and fills height.
  static readonly varsContainer = `
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.16);
  `;

  static readonly varHeaderRow = `
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: ${VAR_GRID};
    gap: 8px;
    padding: 6px 10px;
    background: rgba(18, 20, 24, 0.96);
    backdrop-filter: blur(4px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.5);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  `;

  static readonly varHeaderCell = `
    display: flex;
    align-items: center;
    justify-content: flex-start;
  `;

  static readonly varsBody = `
    display: flex;
    flex-direction: column;
  `;

  static readonly varRow = `
    display: grid;
    grid-template-columns: ${VAR_GRID};
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    align-items: center;
    transition: background 0.15s ease;
  `;

  static readonly varInput = `
    width: 100%;
    min-width: 0;
    padding: 5px 8px;
    background: rgba(0, 0, 0, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  `;

  // Wraps a value input so the reveal (eye) button can sit inside it.
  static readonly valueWrap = `
    position: relative;
    min-width: 0;
  `;

  // Value input for secret variables (extra right padding for the eye button).
  static readonly varInputSecret = `
    width: 100%;
    min-width: 0;
    padding: 5px 30px 5px 8px;
    background: rgba(0, 0, 0, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  `;

  static readonly eyeButton = `
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
  `;

  static readonly varInputDescription = `
    width: 100%;
    min-width: 0;
    padding: 5px 8px;
    background: rgba(0, 0, 0, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-family: inherit;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  `;

  // Per-row "Type" dropdown (Default / Secret).
  static readonly typeSelect = `
    width: 100%;
    min-width: 0;
    padding: 4px 6px;
    background: rgba(0, 0, 0, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.18s ease;
  `;

  static readonly deleteVarButton = `
    width: 26px;
    height: 26px;
    padding: 0;
    background: rgba(var(--error-color-rgb), 0.08);
    border: 1px solid rgba(var(--error-color-rgb), 0.3);
    border-radius: 6px;
    color: var(--error-color);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.18s ease;
  `;

  static readonly varsEmpty = `
    padding: 20px 14px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
  `;

  static readonly addVarButton = `
    flex: 0 0 auto;
    padding: 6px 10px;
    background: rgba(var(--primary-color-rgb), 0.1);
    border: 1px dashed rgba(var(--primary-color-rgb), 0.4);
    border-radius: 7px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    width: 100%;
    transition: all 0.18s ease;
  `;

  static readonly deleteEnvButton = `
    flex: 0 0 auto;
    padding: 6px 12px;
    background: rgba(var(--error-color-rgb), 0.08);
    border: 1px solid rgba(var(--error-color-rgb), 0.35);
    border-radius: 7px;
    color: var(--error-color);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    align-self: flex-start;
    transition: all 0.18s ease;
  `;

  /* ---------- Globals panel ---------- */

  static readonly globalsPanel = `
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.18);
  `;

  static readonly globalsDescription = `
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 12px;
    padding: 9px 11px;
    background: rgba(var(--primary-color-rgb), 0.08);
    border-radius: 7px;
    border-left: 3px solid var(--primary-color);
    line-height: 1.45;
  `;

  /* ---------- Dialog actions (autosave hint / Close) ---------- */

  static readonly autoSaveHint = `
    color: var(--text-secondary);
    font-size: 11px;
    opacity: 0.75;
  `;

  static readonly saveButton = `
    padding: 5px 18px;
    background: linear-gradient(135deg, var(--primary-color) 0%, rgba(var(--primary-color-rgb), 0.82) 100%);
    border: none;
    border-radius: 7px;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.18s ease;
    box-shadow: 0 3px 10px rgba(var(--primary-color-rgb), 0.32);
  `;

  /**
   * Injects the dialog's keyframes once (the previous markup referenced
   * `slideUp`, which was never defined).
   */
  static ensureAnimations(): void {
    const id = 'restbro-env-dialog-anim';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes restbroEnvFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes restbroEnvSlide {
        from { opacity: 0; transform: translateY(14px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

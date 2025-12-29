/**
 * Variable Tooltip Management
 * Handles tooltip creation, positioning, and lifecycle
 */

import { createIconElement } from '../../utils/icons';

/**
 * Global tooltip state to ensure only one tooltip is visible at a time
 */
let globalTooltip: HTMLDivElement | null = null;

/**
 * Track mouse position globally
 */
if (typeof window !== 'undefined') {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    (window as any).__mouseX = e.clientX;
    (window as any).__mouseY = e.clientY;
  });
}

/**
 * Removes the global tooltip if it exists
 */
export function removeGlobalTooltip(): void {
  if (globalTooltip) {
    // Cleanup event listeners if stored
    if ((globalTooltip as any).__cleanup) {
      (globalTooltip as any).__cleanup();
    }
    globalTooltip.remove();
    globalTooltip = null;
  }
}

/**
 * Gets the current global tooltip element
 */
export function getGlobalTooltip(): HTMLDivElement | null {
  return globalTooltip;
}

/**
 * Sets the global tooltip element
 */
export function setGlobalTooltip(tooltip: HTMLDivElement | null): void {
  globalTooltip = tooltip;
}

/**
 * Creates a tooltip element for a variable
 */
export function createVariableTooltip(
  variableName: string,
  value: string | undefined,
  source: string,
  onCopy?: (value: string) => void,
  onEdit?: (variableName: string, currentValue: string | undefined, source: string) => void
): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.className = 'variable-tooltip';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'variable-tooltip-name';
  nameDiv.textContent = variableName;

  const valueDiv = document.createElement('div');
  valueDiv.className = 'variable-tooltip-value';
  valueDiv.textContent = value || 'Not defined';
  if (!value) {
    valueDiv.classList.add('undefined');
  }

  const sourceDiv = document.createElement('div');
  sourceDiv.className = 'variable-tooltip-source';
  sourceDiv.appendChild(createIconElement('pin', { style: { width: '12px', height: '12px' } }));
  sourceDiv.appendChild(document.createTextNode(source));

  tooltip.appendChild(nameDiv);
  tooltip.appendChild(valueDiv);
  tooltip.appendChild(sourceDiv);

  // Add action buttons container
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'variable-tooltip-actions';

  // Add copy button if value exists
  if (value) {
    const copyButton = document.createElement('button');
    copyButton.className = 'variable-tooltip-copy';
    copyButton.title = 'Copy value to clipboard';
    copyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg><span>Copy</span>`;
    copyButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onCopy) {
        onCopy(value);
      } else {
        navigator.clipboard.writeText(value).catch(err => console.error('Failed to copy:', err));
      }
      copyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg><span>Copied!</span>`;
      copyButton.classList.add('copied');
      setTimeout(() => {
        copyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg><span>Copy</span>`;
        copyButton.classList.remove('copied');
      }, 1500);
    });
    actionsDiv.appendChild(copyButton);
  }

  // Add edit button
  const editButton = document.createElement('button');
  editButton.className = 'variable-tooltip-edit';
  editButton.title = 'Edit variable value';
  editButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg><span>Edit</span>`;
  
  if (onEdit) {
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      onEdit(variableName, value, source);
    });
  } else {
    // If no edit handler provided, dispatch a global event
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const event = new CustomEvent('edit-variable-requested', {
        detail: { variableName, value, source }
      });
      document.dispatchEvent(event);
    });
  }
  actionsDiv.appendChild(editButton);

  tooltip.appendChild(actionsDiv);

  return tooltip;
}

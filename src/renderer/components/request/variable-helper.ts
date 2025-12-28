/**
 * Variable Highlighting and Tooltip Helper
 * Provides visual feedback for {{variable}} syntax in input fields
 */

import { Environment, Collection } from '../../../shared/types';
import { resolveSystemVariable } from '../../../shared/system-variables';
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
function removeGlobalTooltip(): void {
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
 * Builds folder variables by merging ancestor folder variables
 * Precedence: nearest folder (child) overrides distant folder (parent)
 */
export function buildFolderVars(
  collectionId: string | undefined,
  collections: Collection[]
): Record<string, string> {
  if (!collectionId) return {};

  const folderVars: Record<string, string> = {};
  const ancestorChain: Collection[] = [];

  // Build ancestor chain from child to root
  let currentId: string | undefined = collectionId;
  while (currentId) {
    const collection = collections.find(c => c.id === currentId);
    if (!collection) break;

    ancestorChain.push(collection);
    currentId = collection.parentId;
  }

  // Merge variables from root to child (so child overrides parent)
  for (let i = ancestorChain.length - 1; i >= 0; i--) {
    const ancestor = ancestorChain[i];
    if (ancestor.variables && ancestor.type === 'folder') {
      Object.assign(folderVars, ancestor.variables);
    }
  }

  return folderVars;
}

/**
 * Detects variables in text and returns their positions
 */
export function detectVariables(text: string): Array<{ start: number; end: number; name: string }> {
  const variables: Array<{ start: number; end: number; name: string }> = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    variables.push({
      start: match.index,
      end: match.index + match[0].length,
      name: match[1].trim(),
    });
  }

  return variables;
}

/**
 * Resolves a variable name to its value from active environment, folder vars, and globals
 * Precedence: Request Local > Active Environment > Folder (ancestor chain) > Globals
 */
export function resolveVariable(
  variableName: string,
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> },
  folderVars?: Record<string, string>
): { value: string | undefined; source: string } {
  // Check active environment first
  if (activeEnvironment && variableName in activeEnvironment.variables) {
    return {
      value: activeEnvironment.variables[variableName],
      source: `Environment: ${activeEnvironment.name}`,
    };
  }

  // Check folder variables
  if (folderVars && variableName in folderVars) {
    return {
      value: folderVars[variableName],
      source: 'Folder variables',
    };
  }

  // Check globals
  if (variableName in globals.variables) {
    return {
      value: globals.variables[variableName],
      source: 'Global variables',
    };
  }

  const systemValue = resolveSystemVariable(variableName);
  if (systemValue !== undefined) {
    return {
      value: systemValue,
      source: 'System variable',
    };
  }

  return {
    value: undefined,
    source: 'Not defined',
  };
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

/**
 * Adds variable highlighting to an input field
 */
export function addVariableHighlighting(
  inputElement: HTMLInputElement,
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> },
  folderVars?: Record<string, string>
): void {
  const text = inputElement.value;
  const variables = detectVariables(text);
  const highlightId =
    inputElement.dataset.variableHighlightId ||
    `var-highlight-${Math.random().toString(36).slice(2)}`;
  inputElement.dataset.variableHighlightId = highlightId;

  if (variables.length === 0) {
    // Remove any existing highlight container
    const existing = inputElement.parentElement?.querySelector(
      `.variable-highlight-container[data-for="${highlightId}"]`
    );
    if (existing) {
      existing.remove();
    }
    inputElement.classList.remove('has-variable-overlay');
    return;
  }

  // Create or get highlight container
  let container = inputElement.parentElement?.querySelector(
    `.variable-highlight-container[data-for="${highlightId}"]`
  ) as HTMLDivElement;
  const isNewContainer = !container;
  
  if (isNewContainer) {
    container = document.createElement('div');
    container.className = 'variable-highlight-container';
    container.dataset.for = highlightId;
    inputElement.parentElement?.appendChild(container);
  }

  // CRITICAL FIX: Always update position and size, not just on creation
  // This ensures the overlay stays aligned when DOM reflows or tabs switch
  const updatePosition = () => {
    const rect = inputElement.getBoundingClientRect();
    const parentRect = inputElement.parentElement!.getBoundingClientRect();
    container.style.left = `${rect.left - parentRect.left}px`;
    container.style.top = `${rect.top - parentRect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;
  };
  updatePosition();

  // Match input typography so overlay text is identical size/weight
  const computed = window.getComputedStyle(inputElement);
  container.style.fontSize = computed.fontSize;
  container.style.fontFamily = computed.fontFamily;
  container.style.fontWeight = computed.fontWeight;
  container.style.lineHeight = computed.lineHeight;
  container.style.letterSpacing = computed.letterSpacing;
  container.style.padding = computed.padding;

  if (isNewContainer) {
    // CRITICAL FIX: Sync scroll position between input and overlay
    // This allows the overlay to scroll naturally with the input text
    const syncScroll = () => {
      container.scrollLeft = inputElement.scrollLeft;
    };
    inputElement.addEventListener('scroll', syncScroll);

    // Store cleanup function to remove listener if needed
    (container as any).__scrollSyncCleanup = () => {
      inputElement.removeEventListener('scroll', syncScroll);
    };

    // Update position on window resize
    window.addEventListener('resize', updatePosition);

    // Remove tooltip when input gains focus (user is typing)
    const focusHandler = () => {
      removeGlobalTooltip();
    };
    inputElement.addEventListener('focus', focusHandler);

    // Remove tooltip when clicking anywhere in the document
    const clickHandler = (e: MouseEvent) => {
      if (globalTooltip && !globalTooltip.contains(e.target as Node)) {
        removeGlobalTooltip();
      }
    };
    document.addEventListener('click', clickHandler);

    // Store cleanup for these listeners too
    (container as any).__inputCleanup = () => {
      inputElement.removeEventListener('focus', focusHandler);
      document.removeEventListener('click', clickHandler);
    };
  } else {
    // Container exists, ensure scroll is synced
    container.scrollLeft = inputElement.scrollLeft;
  }

  // Clear existing content
  container.innerHTML = '';

  // Add text segments with highlights
  let lastIndex = 0;
  variables.forEach(variable => {
    // Add text before variable
    if (variable.start > lastIndex) {
      const textSpan = document.createElement('span');
      textSpan.textContent = text.substring(lastIndex, variable.start);
      container.appendChild(textSpan);
    }

    // Add highlighted variable
    const varSpan = document.createElement('span');
    varSpan.className = 'variable-highlight';
    varSpan.textContent = text.substring(variable.start, variable.end);

    // Resolve variable to determine if it's defined
    const { value, source } = resolveVariable(variable.name, activeEnvironment, globals, folderVars);
    if (!value) {
      varSpan.classList.add('undefined');
    }

    // Add hover tooltip to the variable span
    varSpan.style.pointerEvents = 'auto';
    varSpan.style.cursor = 'help';

    varSpan.addEventListener('mouseenter', (e: MouseEvent) => {
      // Remove any existing tooltip
      removeGlobalTooltip();

      // Copy handler for the tooltip
      const handleCopy = (valueToCopy: string) => {
        navigator.clipboard.writeText(valueToCopy).catch((err) => {
          console.error('Failed to copy to clipboard:', err);
        });
      };

      // Create and position new tooltip
      globalTooltip = createVariableTooltip(variable.name, value, source, handleCopy);
      document.body.appendChild(globalTooltip);

      // Position tooltip near the cursor
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      globalTooltip.style.position = 'fixed';
      globalTooltip.style.left = `${rect.left}px`;
      globalTooltip.style.top = `${rect.bottom + 5}px`;
      globalTooltip.style.zIndex = '10000';
      globalTooltip.style.pointerEvents = 'auto';

      // Track if mouse enters tooltip
      let mouseEnteredTooltip = false;

      const tooltipMouseEnter = () => {
        mouseEnteredTooltip = true;
      };

      const tooltipMouseLeave = () => {
        removeGlobalTooltip();
      };

      globalTooltip.addEventListener('mouseenter', tooltipMouseEnter);
      globalTooltip.addEventListener('mouseleave', tooltipMouseLeave);

      // Store cleanup function
      (globalTooltip as any).__cleanup = () => {
        globalTooltip?.removeEventListener('mouseenter', tooltipMouseEnter);
        globalTooltip?.removeEventListener('mouseleave', tooltipMouseLeave);
      };
    });

    // Track if we should keep tooltip (for when mouse moves to tooltip)
    let keepTooltipTimer: number | null = null;

    varSpan.addEventListener('mouseleave', () => {
      // Delay to allow mouse to move to tooltip
      keepTooltipTimer = window.setTimeout(() => {
        // Only remove if tooltip exists and mouse hasn't entered it
        if (globalTooltip) {
          const tooltipRect = globalTooltip.getBoundingClientRect();
          const mouseX = (window as any).__mouseX || 0;
          const mouseY = (window as any).__mouseY || 0;
          
          const isOverTooltip = mouseX >= tooltipRect.left &&
                                mouseX <= tooltipRect.right &&
                                mouseY >= tooltipRect.top &&
                                mouseY <= tooltipRect.bottom;

          if (!isOverTooltip) {
            if ((globalTooltip as any).__cleanup) {
              (globalTooltip as any).__cleanup();
            }
            removeGlobalTooltip();
          }
        }
      }, 50); // Reduced delay from 100ms to 50ms
    });

    container.appendChild(varSpan);
    lastIndex = variable.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    const textSpan = document.createElement('span');
    textSpan.textContent = text.substring(lastIndex);
    container.appendChild(textSpan);
  }

  // Mark input so CSS can hide the native text while overlay is active
  inputElement.classList.add('has-variable-overlay');
}

/**
 * Adds hover tooltips to an input field for variables
 */
export function addVariableTooltips(
  inputElement: HTMLInputElement,
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> },
  folderVars?: Record<string, string>
): void {
  type TooltipHandlers = {
    mouseenter: () => void;
    mousemove: (e: MouseEvent) => void;
    mouseleave: () => void;
    blur: () => void;
  };

  // Remove existing handlers to prevent duplicates when reinitializing
  const existingHandlers = (inputElement as any).__variableTooltipHandlers as TooltipHandlers | undefined;
  if (existingHandlers) {
    inputElement.removeEventListener('mouseenter', existingHandlers.mouseenter);
    inputElement.removeEventListener('mousemove', existingHandlers.mousemove);
    inputElement.removeEventListener('mouseleave', existingHandlers.mouseleave);
    inputElement.removeEventListener('blur', existingHandlers.blur);
  }

  let isMouseOver = false;

  const showTooltip = (e: MouseEvent) => {
    const text = inputElement.value;
    const variables = detectVariables(text);

    if (variables.length === 0) {
      removeGlobalTooltip();
      return;
    }

    // Show tooltip for first variable when mouse is over the input
    const hoveredVariable = variables[0];

    // Resolve the variable
    const { value, source } = resolveVariable(hoveredVariable.name, activeEnvironment, globals, folderVars);

    // Remove existing global tooltip
    removeGlobalTooltip();

    // Copy handler for the tooltip
    const handleCopy = (valueToCopy: string) => {
      navigator.clipboard.writeText(valueToCopy).catch((err) => {
        console.error('Failed to copy to clipboard:', err);
      });
    };

    // Create and position new tooltip
    globalTooltip = createVariableTooltip(hoveredVariable.name, value, source, handleCopy);
    document.body.appendChild(globalTooltip);

    // Position tooltip near the cursor
    globalTooltip.style.position = 'fixed';
    globalTooltip.style.left = `${e.clientX + 15}px`;
    globalTooltip.style.top = `${e.clientY + 15}px`;
    globalTooltip.style.zIndex = '10000';
    globalTooltip.style.pointerEvents = 'auto'; // Enable clicking on the tooltip
  };

  const hideTooltip = () => {
    removeGlobalTooltip();
  };

  const handleMouseEnter = () => {
    isMouseOver = true;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isMouseOver) {
      showTooltip(e);
    }
  };

  const handleMouseLeave = () => {
    isMouseOver = false;
    // Delay hiding to allow moving mouse to tooltip
    setTimeout(() => {
      if (!isMouseOver && globalTooltip) {
        // Check if mouse is over the tooltip
        const tooltipRect = globalTooltip.getBoundingClientRect();
        const isOverTooltip = document.elementFromPoint(
          tooltipRect.left + tooltipRect.width / 2,
          tooltipRect.top + tooltipRect.height / 2
        ) === globalTooltip || globalTooltip.contains(document.elementFromPoint(
          tooltipRect.left + tooltipRect.width / 2,
          tooltipRect.top + tooltipRect.height / 2
        ) as Node);

        if (!isOverTooltip) {
          hideTooltip();
        } else {
          // Add mouse leave handler to tooltip itself
          globalTooltip.addEventListener('mouseleave', () => {
            hideTooltip();
          }, { once: true });
        }
      }
    }, 100);
  };

  const handleBlur = () => {
    hideTooltip();
  };

  inputElement.addEventListener('mouseenter', handleMouseEnter);
  inputElement.addEventListener('mousemove', handleMouseMove);
  inputElement.addEventListener('mouseleave', handleMouseLeave);
  inputElement.addEventListener('blur', handleBlur);

  // Store handlers for cleanup on reinitialization
  (inputElement as any).__variableTooltipHandlers = {
    mouseenter: handleMouseEnter,
    mousemove: handleMouseMove,
    mouseleave: handleMouseLeave,
    blur: handleBlur
  };
}

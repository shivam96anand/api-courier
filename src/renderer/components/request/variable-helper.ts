/**
 * Variable Highlighting and Tooltip Helper
 * Provides visual feedback for {{variable}} syntax in input fields
 */

import { Environment, Collection } from '../../../shared/types';

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
  if (activeEnvironment && activeEnvironment.variables[variableName]) {
    return {
      value: activeEnvironment.variables[variableName],
      source: `Environment: ${activeEnvironment.name}`,
    };
  }

  // Check folder variables
  if (folderVars && folderVars[variableName]) {
    return {
      value: folderVars[variableName],
      source: 'Folder variables',
    };
  }

  // Check globals
  if (globals.variables[variableName]) {
    return {
      value: globals.variables[variableName],
      source: 'Global variables',
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
  source: string
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
  sourceDiv.textContent = source;

  tooltip.appendChild(nameDiv);
  tooltip.appendChild(valueDiv);
  tooltip.appendChild(sourceDiv);

  return tooltip;
}

/**
 * Adds variable highlighting to an input field
 */
export function addVariableHighlighting(
  inputElement: HTMLInputElement,
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> }
): void {
  const text = inputElement.value;
  const variables = detectVariables(text);

  if (variables.length === 0) {
    // Remove any existing highlight container
    const existing = inputElement.parentElement?.querySelector('.variable-highlight-container');
    if (existing) {
      existing.remove();
    }
    inputElement.classList.remove('has-variable-overlay');
    return;
  }

  // Create or get highlight container
  let container = inputElement.parentElement?.querySelector('.variable-highlight-container') as HTMLDivElement;
  if (!container) {
    container = document.createElement('div');
    container.className = 'variable-highlight-container';
    inputElement.parentElement?.appendChild(container);

    // Position container to overlay the input
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

    // Update position on window resize
    window.addEventListener('resize', updatePosition);
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
    const { value } = resolveVariable(variable.name, activeEnvironment, globals);
    if (!value) {
      varSpan.classList.add('undefined');
    }

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

  let currentTooltip: HTMLDivElement | null = null;
  let isMouseOver = false;

  const showTooltip = (e: MouseEvent) => {
    const text = inputElement.value;
    const variables = detectVariables(text);

    if (variables.length === 0) {
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }
      return;
    }

    // Show tooltip for first variable when mouse is over the input
    const hoveredVariable = variables[0];

    // Resolve the variable
    const { value, source } = resolveVariable(hoveredVariable.name, activeEnvironment, globals, folderVars);

    // Remove existing tooltip
    if (currentTooltip) {
      currentTooltip.remove();
    }

    // Create and position new tooltip
    currentTooltip = createVariableTooltip(hoveredVariable.name, value, source);
    document.body.appendChild(currentTooltip);

    // Position tooltip near the cursor
    currentTooltip.style.position = 'fixed';
    currentTooltip.style.left = `${e.clientX + 15}px`;
    currentTooltip.style.top = `${e.clientY + 15}px`;
    currentTooltip.style.zIndex = '10000';
  };

  const hideTooltip = () => {
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
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
    hideTooltip();
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

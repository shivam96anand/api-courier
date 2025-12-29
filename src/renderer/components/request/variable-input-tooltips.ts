/**
 * Variable Input Tooltips
 * Provides hover tooltips for {{variable}} syntax in input fields
 */

import { Environment } from '../../../shared/types';
import { detectVariables, resolveVariable } from './variable-detection';
import { createVariableTooltip, removeGlobalTooltip, getGlobalTooltip, setGlobalTooltip } from './variable-tooltip';

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
    const tooltip = createVariableTooltip(hoveredVariable.name, value, source, handleCopy);
    setGlobalTooltip(tooltip);
    document.body.appendChild(tooltip);

    // Position tooltip near the cursor
    tooltip.style.position = 'fixed';
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.top = `${e.clientY + 15}px`;
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'auto'; // Enable clicking on the tooltip
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
      const globalTooltip = getGlobalTooltip();
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

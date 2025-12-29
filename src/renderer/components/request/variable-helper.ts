/**
 * Variable Highlighting and Tooltip Helper
 * Barrel file that re-exports all variable helper functions
 * 
 * Split into smaller modules:
 * - variable-detection.ts: Core variable detection and resolution utilities
 * - variable-tooltip.ts: Tooltip creation and management
 * - variable-highlighting.ts: Input highlighting integration
 * - variable-input-tooltips.ts: Input hover tooltip integration
 */

// Re-export from variable-detection.ts
export { buildFolderVars, detectVariables, resolveVariable } from './variable-detection';

// Re-export from variable-tooltip.ts
export { createVariableTooltip, removeGlobalTooltip } from './variable-tooltip';

// Re-export from variable-highlighting.ts
export { addVariableHighlighting } from './variable-highlighting';

// Re-export from variable-input-tooltips.ts
export { addVariableTooltips } from './variable-input-tooltips';

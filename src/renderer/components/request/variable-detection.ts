/**
 * Variable Detection and Resolution Utilities
 * Core functions for detecting {{variable}} syntax and resolving values
 */

import { Environment, Collection } from '../../../shared/types';
import { resolveSystemVariable } from '../../../shared/system-variables';

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

  // Build ancestor chain from child to root. `seen` guards against a corrupt
  // or imported tree where parentId forms a cycle.
  const seen = new Set<string>();
  let currentId: string | undefined = collectionId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const collection = collections.find((c) => c.id === currentId);
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
export function detectVariables(
  text: string
): Array<{ start: number; end: number; name: string }> {
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
 * Own-property lookup. Plain `name in map` walks the prototype chain, so
 * `{{constructor}}` / `{{toString}}` resolved to JS internals instead of being
 * left alone as unknown variables.
 */
function hasVar(map: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, name);
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
  if (activeEnvironment && hasVar(activeEnvironment.variables, variableName)) {
    return {
      value: activeEnvironment.variables[variableName],
      source: `Environment: ${activeEnvironment.name}`,
    };
  }

  // Check folder variables
  if (folderVars && hasVar(folderVars, variableName)) {
    return {
      value: folderVars[variableName],
      source: 'Folder variables',
    };
  }

  // Check globals
  if (hasVar(globals.variables, variableName)) {
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

import { resolveSystemVariable } from '../../../shared/system-variables';

/**
 * VariableResolver - Handles resolution of variables in strings
 * Resolves {{variableName}} placeholders with actual values from environment, folder, and global scopes
 */
export class VariableResolver {
  /**
   * Resolves variables in a configuration object
   * @param config - Configuration object with potential variable placeholders
   * @param collectionId - Current collection/folder ID for folder variable resolution
   * @returns Resolved configuration object
   */
  async resolveConfig(
    config: Record<string, string>,
    collectionId?: string
  ): Promise<Record<string, string>> {
    try {
      // Get current app state
      const state: any = await window.apiCourier.store.get();

      // Get active environment
      const activeEnvironment = state.activeEnvironmentId
        ? state.environments.find((e: any) => e.id === state.activeEnvironmentId)
        : undefined;

      const globals = state.globals || { variables: {} };

      // Build folder variables from collectionId
      const folderVars = this.buildFolderVars(collectionId, state.collections);

      console.log('[VariableResolver] Folder variables:', folderVars);
      console.log('[VariableResolver] Environment variables:', activeEnvironment?.variables);
      console.log('[VariableResolver] Global variables:', globals.variables);

      // Resolve each field in the config
      const resolvedConfig: Record<string, string> = {};

      for (const [key, value] of Object.entries(config)) {
        resolvedConfig[key] = this.resolveString(
          value,
          folderVars,
          activeEnvironment?.variables || {},
          globals.variables
        );
      }

      return resolvedConfig;
    } catch (error) {
      console.error('[VariableResolver] Error resolving variables:', error);
      return config; // Return original config if resolution fails
    }
  }

  /**
   * Resolves variables in a single string
   * @param input - String with potential {{variable}} placeholders
   * @param folderVars - Variables from folder hierarchy
   * @param envVars - Variables from active environment
   * @param globalVars - Global variables
   * @returns String with resolved variables
   */
  resolveString(
    input: string,
    folderVars: Record<string, string>,
    envVars: Record<string, string>,
    globalVars: Record<string, string>
  ): string {
    // Replace {{variableName}} with actual values
    return input.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedVar = varName.trim();

      // Check precedence: env > folder > global
      if (envVars[trimmedVar] !== undefined) {
        return envVars[trimmedVar];
      }
      if (folderVars[trimmedVar] !== undefined) {
        return folderVars[trimmedVar];
      }
      if (globalVars[trimmedVar] !== undefined) {
        return globalVars[trimmedVar];
      }

      const systemValue = resolveSystemVariable(trimmedVar);
      if (systemValue !== undefined) {
        return systemValue;
      }

      // If not found, return the original placeholder
      return match;
    });
  }

  /**
   * Builds folder variables from collection hierarchy
   * Merges variables from all ancestor folders (root to child)
   * @param collectionId - Current collection/folder ID
   * @param collections - All collections from app state
   * @returns Merged folder variables
   */
  buildFolderVars(
    collectionId: string | undefined,
    collections: any[]
  ): Record<string, string> {
    if (!collectionId) return {};

    const folderVars: Record<string, string> = {};
    const ancestorChain: any[] = [];

    // Build ancestor chain from child to root
    let currentId: string | undefined = collectionId;
    while (currentId) {
      const collection = collections.find((c: any) => c.id === currentId);
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
}

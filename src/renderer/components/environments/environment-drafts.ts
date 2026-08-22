/**
 * Draft rows are placeholder variables the user has added but not named yet.
 * They stay in the dialog's working state so the row keeps its focus, but they
 * must never reach persisted state.
 */

import { Environment, Globals } from '../../../shared/types';

export const DRAFT_PREFIX = '__restbro_draft__';

export interface EnvironmentDialogResult {
  environments: Environment[];
  activeEnvironmentId?: string;
  globals?: Globals;
}

interface VariableRecords {
  variables: Record<string, string>;
  variableDescriptions: Record<string, string>;
  variableSecrets: Record<string, boolean>;
}

function withoutDrafts(
  variables: Record<string, string>,
  descriptions: Record<string, string> = {},
  secrets: Record<string, boolean> = {}
): VariableRecords {
  const result: VariableRecords = {
    variables: {},
    variableDescriptions: {},
    variableSecrets: {},
  };

  Object.keys(variables).forEach((key) => {
    if (!key || key.startsWith(DRAFT_PREFIX)) return;
    result.variables[key] = variables[key];
    if (descriptions[key] !== undefined) {
      result.variableDescriptions[key] = descriptions[key];
    }
    if (secrets[key] !== undefined) {
      result.variableSecrets[key] = secrets[key];
    }
  });

  return result;
}

/**
 * Snapshots the dialog's working state for persistence. Everything is copied so
 * the dialog can keep being edited after an autosave without mutating what was
 * just handed to the store.
 */
export function buildDialogResult(
  workingEnvs: Environment[],
  workingActiveId: string | undefined,
  workingGlobals: Globals
): EnvironmentDialogResult {
  return {
    environments: workingEnvs.map((env) => ({
      ...env,
      ...withoutDrafts(
        env.variables,
        env.variableDescriptions,
        env.variableSecrets
      ),
    })),
    activeEnvironmentId: workingActiveId,
    globals: {
      ...workingGlobals,
      ...withoutDrafts(
        workingGlobals.variables,
        workingGlobals.variableDescriptions,
        workingGlobals.variableSecrets
      ),
    },
  };
}

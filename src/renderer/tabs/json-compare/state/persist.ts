/**
 * Persistence layer for JSON Compare state.
 *
 * Reads/writes through the main-process StoreManager via the preload bridge —
 * NEVER localStorage (see AGENTS.md).
 *
 * Includes a one-time migration that copies any legacy localStorage state
 * into the store, then deletes the legacy key.
 */

import type {
  JsonCompareUIState,
  JsonCompareOptions,
} from '../../../../shared/types';

const LEGACY_STORAGE_KEY = 'restbro.jsonCompare.v1';

const DEFAULT_OPTIONS: Required<JsonCompareOptions> = {
  sortKeys: false,
  ignoreArrayOrder: true,
  caseInsensitive: false,
  ignoreStringWhitespace: false,
  ignorePaths: [],
};

const DEFAULT_STATE: JsonCompareUIState = {
  leftJson: '',
  rightJson: '',
  tableFilter: '',
  valueFilter: '',
  selectedTypes: ['added', 'removed', 'changed'],
  leftLabel: 'Left',
  rightLabel: 'Right',
  options: DEFAULT_OPTIONS,
};

function normalize(
  state: Partial<JsonCompareUIState> | undefined
): JsonCompareUIState {
  if (!state) return { ...DEFAULT_STATE, options: { ...DEFAULT_OPTIONS } };
  return {
    leftJson: typeof state.leftJson === 'string' ? state.leftJson : '',
    rightJson: typeof state.rightJson === 'string' ? state.rightJson : '',
    leftTruncated: !!state.leftTruncated,
    rightTruncated: !!state.rightTruncated,
    tableFilter: typeof state.tableFilter === 'string' ? state.tableFilter : '',
    valueFilter: typeof state.valueFilter === 'string' ? state.valueFilter : '',
    selectedTypes:
      Array.isArray(state.selectedTypes) && state.selectedTypes.length > 0
        ? state.selectedTypes
        : DEFAULT_STATE.selectedTypes,
    leftLabel: state.leftLabel || DEFAULT_STATE.leftLabel,
    rightLabel: state.rightLabel || DEFAULT_STATE.rightLabel,
    options: { ...DEFAULT_OPTIONS, ...(state.options || {}) },
  };
}

function readLegacyState(): Partial<JsonCompareUIState> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

interface RestbroStore {
  get: () => Promise<unknown>;
  set: (updates: Record<string, unknown>) => Promise<void>;
}

function getStoreApi(): RestbroStore | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { restbro?: { store?: RestbroStore } };
  return w.restbro?.store;
}

/** Load JSON-Compare state from the main-process store. */
export async function loadCompareState(): Promise<JsonCompareUIState> {
  const store = getStoreApi();
  if (!store) {
    return normalize(readLegacyState() || undefined);
  }

  try {
    const state = (await store.get()) as {
      jsonCompareUIState?: Partial<JsonCompareUIState>;
    };

    const fromStore = state?.jsonCompareUIState;
    if (
      fromStore &&
      (fromStore.leftJson || fromStore.rightJson || fromStore.tableFilter)
    ) {
      return normalize(fromStore);
    }

    // First load: migrate from legacy localStorage if present.
    const legacy = readLegacyState();
    if (legacy) {
      const migrated = normalize(legacy);
      void saveCompareState(migrated);
      return migrated;
    }

    return normalize(fromStore);
  } catch {
    return normalize(readLegacyState() || undefined);
  }
}

/** Persist state through the main-process store (debounced + size-capped in main). */
export async function saveCompareState(
  state: JsonCompareUIState
): Promise<void> {
  const store = getStoreApi();
  if (!store) return;

  try {
    await store.set({ jsonCompareUIState: state });
  } catch (err) {
    console.error('[json-compare] failed to persist state:', err);
  }
}

export const DEFAULT_COMPARE_STATE = DEFAULT_STATE;

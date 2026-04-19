/**
 * Hook: load + persist JsonCompareUIState through the main-process StoreManager.
 *
 * - Loads once on mount.
 * - Persists changes with a 1 s debounce (size cap is enforced in main).
 * - Flushes pending writes on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import {
  loadCompareState,
  saveCompareState,
  DEFAULT_COMPARE_STATE,
} from '../state/persist';
import type { JsonCompareUIState } from '../../../../shared/types';

const PERSIST_DEBOUNCE_MS = 1000;

export function useComparePersistence(): {
  loaded: boolean;
  state: JsonCompareUIState;
  setState: (updater: (s: JsonCompareUIState) => JsonCompareUIState) => void;
} {
  const [loaded, setLoaded] = useState(false);
  const [state, setStateInternal] = useState<JsonCompareUIState>(
    DEFAULT_COMPARE_STATE
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<JsonCompareUIState>(DEFAULT_COMPARE_STATE);

  useEffect(() => {
    let cancelled = false;
    void loadCompareState().then((s) => {
      if (cancelled) return;
      latestRef.current = s;
      setStateInternal(s);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change, debounced.
  useEffect(() => {
    if (!loaded) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveCompareState(latestRef.current);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, loaded]);

  // Flush on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (loaded) void saveCompareState(latestRef.current);
    };
  }, []);

  const setState = (updater: (s: JsonCompareUIState) => JsonCompareUIState) => {
    setStateInternal((prev) => {
      const next = updater(prev);
      latestRef.current = next;
      return next;
    });
  };

  return { loaded, state, setState };
}

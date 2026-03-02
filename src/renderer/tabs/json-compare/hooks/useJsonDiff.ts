/**
 * Hook to manage JSON diff computation.
 * Tries Web Worker first; falls back to inline (main-thread) computation
 * when the worker is unavailable (e.g. Electron file:// + sandbox).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { create, DiffPatcher } from 'jsondiffpatch';
import { buildDiffRows } from '../utils/diffMap';
import type { DiffResult, DiffStats, WorkerRequest, WorkerResponse } from '../types';

interface UseJsonDiffOptions {
  debounceMs?: number;
  /** Max ms to wait for the worker before falling back to inline. */
  workerTimeoutMs?: number;
}

interface UseJsonDiffResult {
  status: 'idle' | 'computing' | 'success' | 'error';
  result: DiffResult | null;
  error: string | null;
  compute: () => void;
}

// Lazy-init a DiffPatcher for inline fallback
let inlineDiffer: DiffPatcher | null = null;
function getInlineDiffer(): DiffPatcher {
  if (!inlineDiffer) {
    inlineDiffer = create({
      objectHash: (obj: unknown) => (obj as { id?: string })?.id || JSON.stringify(obj),
      arrays: { detectMove: true },
      textDiff: { minLength: Infinity }
    });
  }
  return inlineDiffer;
}

/**
 * Compute diff result synchronously on the main thread.
 */
function computeInline(leftJson: string, rightJson: string): DiffResult {
  const start = performance.now();

  const leftParsed = JSON.parse(leftJson);
  const rightParsed = JSON.parse(rightJson);

  const differ = getInlineDiffer();
  const delta = differ.diff(leftParsed, rightParsed);
  const rows = buildDiffRows(delta);

  const stats: DiffStats = {
    added: rows.filter(r => r.type === 'added').length,
    removed: rows.filter(r => r.type === 'removed').length,
    changed: rows.filter(r => r.type === 'changed').length,
    totalTime: performance.now() - start
  };

  return { rows, leftDecorations: [], rightDecorations: [], stats };
}

export function useJsonDiff(
  leftJson: string,
  rightJson: string,
  leftValid: boolean,
  rightValid: boolean,
  options: UseJsonDiffOptions = {}
): UseJsonDiffResult {
  const { debounceMs = 300, workerTimeoutMs = 2000 } = options;

  const [status, setStatus] = useState<'idle' | 'computing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  /** true once we know the worker is broken; skip it from then on */
  const workerBrokenRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const workerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ---------- Worker setup ----------
  useEffect(() => {
    try {
      const w = new Worker(new URL('../worker/diffWorker.ts', import.meta.url));

      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        // Worker responded — clear the fallback timeout
        if (workerTimeoutRef.current) {
          clearTimeout(workerTimeoutRef.current);
          workerTimeoutRef.current = null;
        }

        const { type, result: workerResult, error: workerError } = e.data;

        if (type === 'diff-result' && workerResult) {
          setResult(workerResult);
          setStatus('success');
          setError(null);
        } else if (type === 'error') {
          setError(workerError || 'Unknown error');
          setStatus('error');
          setResult(null);
        }
      };

      w.onerror = () => {
        // Worker is broken (e.g. file:// + sandbox). Mark and fall back.
        workerBrokenRef.current = true;
        w.terminate();
        workerRef.current = null;
      };

      workerRef.current = w;
    } catch {
      workerBrokenRef.current = true;
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    };
  }, []);

  // ---------- Inline fallback ----------
  const runInline = useCallback((left: string, right: string) => {
    try {
      const diffResult = computeInline(left, right);
      setResult(diffResult);
      setStatus('success');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
      setResult(null);
    }
  }, []);

  // ---------- Compute (worker → inline fallback) ----------
  const compute = useCallback(() => {
    if (!leftValid || !rightValid) {
      setResult(null);
      setStatus('idle');
      return;
    }

    if (!leftJson.trim() || !rightJson.trim()) {
      setResult(null);
      setStatus('idle');
      return;
    }

    setStatus('computing');
    setError(null);

    // Fast path: worker is known broken → compute inline immediately
    if (workerBrokenRef.current || !workerRef.current) {
      runInline(leftJson, rightJson);
      return;
    }

    // Try the worker, but set a timeout to fall back to inline
    workerRef.current.postMessage({
      type: 'diff',
      leftJson,
      rightJson
    } as WorkerRequest);

    // If the worker doesn't respond in time, fall back
    if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    workerTimeoutRef.current = setTimeout(() => {
      workerTimeoutRef.current = null;
      workerBrokenRef.current = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      runInline(leftJson, rightJson);
    }, workerTimeoutMs);
  }, [leftJson, rightJson, leftValid, rightValid, runInline, workerTimeoutMs]);

  // ---------- Auto-compute with debounce ----------
  useEffect(() => {
    if (!leftValid || !rightValid) {
      setResult(null);
      setStatus('idle');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      compute();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [leftJson, rightJson, leftValid, rightValid, debounceMs, compute]);

  return { status, result, error, compute };
}

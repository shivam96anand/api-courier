/**
 * Hook to manage JSON diff computation.
 *
 * - Tries the Web Worker first; falls back to inline (main-thread) computation
 *   when the worker is unavailable (e.g. Electron file:// + sandbox).
 * - Tags each request with a monotonically-increasing requestId so stale
 *   worker responses are discarded.
 * - Honours user-supplied JsonCompareOptions.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { create, DiffPatcher } from 'jsondiffpatch';
import {
  buildDiffRows,
  computeDecorations,
  filterDiffRowsByIgnorePaths,
} from '../utils/diffMap';
import { computeObjectHash } from '../utils/objectHash';
import { applyCompareOptions } from '../utils/applyCompareOptions';
import type {
  DiffResult,
  DiffStats,
  WorkerRequest,
  WorkerResponse,
} from '../types';
import type { JsonCompareOptions } from '../../../../shared/types';

interface UseJsonDiffOptions {
  debounceMs?: number;
  /** Max ms to wait for the worker before falling back to inline. */
  workerTimeoutMs?: number;
  /** User-selected comparison options. */
  compareOptions?: JsonCompareOptions;
}

interface UseJsonDiffResult {
  status: 'idle' | 'computing' | 'success' | 'error';
  result: DiffResult | null;
  error: string | null;
  workerUnavailable: boolean;
  compute: () => void;
}

let inlineDetectMove: DiffPatcher | null = null;
let inlineNoMove: DiffPatcher | null = null;

function getInlineDiffer(opts: JsonCompareOptions | undefined): DiffPatcher {
  if (opts?.ignoreArrayOrder === false) {
    if (!inlineNoMove) {
      inlineNoMove = create({
        objectHash: computeObjectHash,
        arrays: { detectMove: false },
        textDiff: { minLength: Infinity },
      });
    }
    return inlineNoMove;
  }
  if (!inlineDetectMove) {
    inlineDetectMove = create({
      objectHash: computeObjectHash,
      arrays: { detectMove: true },
      textDiff: { minLength: Infinity },
    });
  }
  return inlineDetectMove;
}

function computeInline(
  leftJson: string,
  rightJson: string,
  options: JsonCompareOptions | undefined
): DiffResult {
  const start = performance.now();

  const leftParsed = JSON.parse(leftJson);
  const rightParsed = JSON.parse(rightJson);

  const leftNorm = applyCompareOptions(leftParsed, options);
  const rightNorm = applyCompareOptions(rightParsed, options);

  const differ = getInlineDiffer(options);
  const delta = differ.diff(leftNorm, rightNorm);
  let rows = buildDiffRows(delta);
  rows = filterDiffRowsByIgnorePaths(rows, options?.ignorePaths);

  const { leftDecorations, rightDecorations } = computeDecorations(
    rows,
    leftJson,
    rightJson
  );

  const stats: DiffStats = {
    added: rows.filter((r) => r.type === 'added').length,
    removed: rows.filter((r) => r.type === 'removed').length,
    changed: rows.filter((r) => r.type === 'changed').length,
    totalTime: performance.now() - start,
  };

  return { rows, leftDecorations, rightDecorations, stats };
}

export function useJsonDiff(
  leftJson: string,
  rightJson: string,
  leftValid: boolean,
  rightValid: boolean,
  options: UseJsonDiffOptions = {}
): UseJsonDiffResult {
  const { debounceMs = 300, workerTimeoutMs = 2000, compareOptions } = options;

  const [status, setStatus] = useState<
    'idle' | 'computing' | 'success' | 'error'
  >('idle');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerUnavailable, setWorkerUnavailable] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const workerBrokenRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  /** Tracks the requestId of the in-flight worker call (for fast-fallback on error). */
  const inFlightRef = useRef<{
    id: number;
    left: string;
    right: string;
    options: JsonCompareOptions | undefined;
  } | null>(null);

  // ---------- Worker setup ----------
  useEffect(() => {
    try {
      const w = new Worker(new URL('../worker/diffWorker.ts', import.meta.url));

      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const {
          type,
          requestId,
          result: workerResult,
          error: workerError,
        } = e.data;

        // Discard stale responses (a newer compute() has been issued).
        if (requestId !== requestIdRef.current) return;

        if (workerTimeoutRef.current) {
          clearTimeout(workerTimeoutRef.current);
          workerTimeoutRef.current = null;
        }
        inFlightRef.current = null;

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
        // Worker is broken (e.g. file:// + sandbox). Mark and fall back NOW
        // for any in-flight request — don't wait for the timeout.
        workerBrokenRef.current = true;
        setWorkerUnavailable(true);
        if (workerTimeoutRef.current) {
          clearTimeout(workerTimeoutRef.current);
          workerTimeoutRef.current = null;
        }
        const inflight = inFlightRef.current;
        inFlightRef.current = null;
        try {
          w.terminate();
        } catch {
          /* noop */
        }
        workerRef.current = null;

        if (inflight) {
          runInlineSafe(
            inflight.left,
            inflight.right,
            inflight.options,
            inflight.id
          );
        }
      };

      workerRef.current = w;
    } catch {
      workerBrokenRef.current = true;
      setWorkerUnavailable(true);
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    };
  }, []);

  // ---------- Inline fallback ----------
  const runInlineSafe = useCallback(
    (
      left: string,
      right: string,
      opts: JsonCompareOptions | undefined,
      requestId: number
    ) => {
      try {
        const diffResult = computeInline(left, right, opts);
        if (requestId !== requestIdRef.current) return; // stale
        setResult(diffResult);
        setStatus('success');
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError((err as Error).message);
        setStatus('error');
        setResult(null);
      }
    },
    []
  );

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

    const requestId = ++requestIdRef.current;
    setStatus('computing');
    setError(null);

    if (workerBrokenRef.current || !workerRef.current) {
      runInlineSafe(leftJson, rightJson, compareOptions, requestId);
      return;
    }

    inFlightRef.current = {
      id: requestId,
      left: leftJson,
      right: rightJson,
      options: compareOptions,
    };

    workerRef.current.postMessage({
      type: 'diff',
      requestId,
      leftJson,
      rightJson,
      options: compareOptions,
    } as WorkerRequest);

    if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    workerTimeoutRef.current = setTimeout(() => {
      workerTimeoutRef.current = null;
      workerBrokenRef.current = true;
      setWorkerUnavailable(true);
      try {
        workerRef.current?.terminate();
      } catch {
        /* noop */
      }
      workerRef.current = null;
      const inflight = inFlightRef.current;
      inFlightRef.current = null;
      if (inflight) {
        runInlineSafe(
          inflight.left,
          inflight.right,
          inflight.options,
          inflight.id
        );
      }
    }, workerTimeoutMs);
  }, [
    leftJson,
    rightJson,
    leftValid,
    rightValid,
    compareOptions,
    runInlineSafe,
    workerTimeoutMs,
  ]);

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

  return { status, result, error, workerUnavailable, compute };
}

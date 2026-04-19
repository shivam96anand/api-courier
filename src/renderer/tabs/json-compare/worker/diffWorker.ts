/**
 * Web Worker for JSON diff computation
 * Runs jsondiffpatch in background to avoid blocking UI.
 *
 * Honours user-selected JsonCompareOptions and tags each response with
 * requestId so stale results can be discarded by the caller.
 */

import { create, DiffPatcher } from 'jsondiffpatch';
import {
  buildDiffRows,
  computeDecorations,
  filterDiffRowsByIgnorePaths,
} from '../utils/diffMap';
import { computeObjectHash } from '../utils/objectHash';
import { applyCompareOptions } from '../utils/applyCompareOptions';
import type {
  WorkerRequest,
  WorkerResponse,
  DiffResult,
  DiffStats,
} from '../types';
import type { JsonCompareOptions } from '../../../../shared/types';

const detectMoveDiffer: DiffPatcher = create({
  objectHash: computeObjectHash,
  arrays: { detectMove: true },
  textDiff: { minLength: Infinity },
});

const noMoveDiffer: DiffPatcher = create({
  objectHash: computeObjectHash,
  arrays: { detectMove: false },
  textDiff: { minLength: Infinity },
});

function pickDiffer(options: JsonCompareOptions | undefined): DiffPatcher {
  return options?.ignoreArrayOrder === false ? noMoveDiffer : detectMoveDiffer;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, requestId, leftJson, rightJson, options } = e.data;
  if (type !== 'diff') return;

  const startTime = performance.now();

  try {
    let leftParsed: unknown;
    let rightParsed: unknown;
    try {
      leftParsed = JSON.parse(leftJson);
    } catch (err) {
      throw new Error(`Left JSON invalid: ${(err as Error).message}`);
    }
    try {
      rightParsed = JSON.parse(rightJson);
    } catch (err) {
      throw new Error(`Right JSON invalid: ${(err as Error).message}`);
    }

    const leftNorm = applyCompareOptions(leftParsed, options);
    const rightNorm = applyCompareOptions(rightParsed, options);

    const differ = pickDiffer(options);
    const delta = differ.diff(leftNorm, rightNorm);

    let rows = buildDiffRows(delta);
    rows = filterDiffRowsByIgnorePaths(rows, options?.ignorePaths);

    // Decorations against ORIGINAL text so highlights align with what the user sees.
    const { leftDecorations, rightDecorations } = computeDecorations(
      rows,
      leftJson,
      rightJson
    );

    const stats: DiffStats = {
      added: rows.filter((r) => r.type === 'added').length,
      removed: rows.filter((r) => r.type === 'removed').length,
      changed: rows.filter((r) => r.type === 'changed').length,
      totalTime: performance.now() - startTime,
    };

    const result: DiffResult = {
      rows,
      leftDecorations,
      rightDecorations,
      stats,
    };

    const response: WorkerResponse = {
      type: 'diff-result',
      requestId,
      result,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      requestId,
      error: (error as Error).message,
    };
    self.postMessage(response);
  }
};

/**
 * Core type definitions for JSON Compare feature
 */

import type {
  JsonCompareUIState,
  JsonCompareOptions,
  JsonCompareChangeType,
} from '../../../shared/types';

export type DiffChangeType = JsonCompareChangeType;

/** @deprecated kept for backward compat with existing tests; prefer JsonCompareUIState */
export type CompareState = JsonCompareUIState;
export type CompareOptions = JsonCompareOptions;

export interface DiffRow {
  path: string;
  type: DiffChangeType;
  leftValue?: unknown;
  rightValue?: unknown;
}

export interface DiffDecoration {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  type: DiffChangeType;
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  totalTime: number;
}

export interface DiffResult {
  rows: DiffRow[];
  leftDecorations: DiffDecoration[];
  rightDecorations: DiffDecoration[];
  stats: DiffStats;
}

export interface WorkerRequest {
  type: 'diff';
  /** Monotonically increasing id used to discard stale responses. */
  requestId: number;
  leftJson: string;
  rightJson: string;
  options?: JsonCompareOptions;
}

export interface WorkerResponse {
  type: 'diff-result' | 'error';
  /** Echoes the requestId from the matching request. */
  requestId: number;
  result?: DiffResult;
  error?: string;
}

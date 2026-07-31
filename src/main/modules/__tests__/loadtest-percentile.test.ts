import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', async () => import('../../../__mocks__/electron'));

import { percentileOf } from '../loadtest-engine';

const sorted = (values: number[]): number[] =>
  [...values].sort((a, b) => a - b);

describe('loadtest-engine.ts — percentileOf', () => {
  it('matches the reference values for 1..100', () => {
    const series = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentileOf(series, 50)).toBe(50);
    expect(percentileOf(series, 95)).toBe(95);
    expect(percentileOf(series, 99)).toBe(99);
    expect(percentileOf(series, 100)).toBe(100);
  });

  it('returns 0 for an empty series', () => {
    expect(percentileOf([], 50)).toBe(0);
    expect(percentileOf([], 95)).toBe(0);
    expect(percentileOf([], 99)).toBe(0);
  });

  it('returns the only sample for a single-element series', () => {
    expect(percentileOf([42], 50)).toBe(42);
    expect(percentileOf([42], 95)).toBe(42);
    expect(percentileOf([42], 99)).toBe(42);
  });

  it('handles a two-element series', () => {
    expect(percentileOf([10, 20], 50)).toBe(10);
    expect(percentileOf([10, 20], 95)).toBe(20);
    expect(percentileOf([10, 20], 99)).toBe(20);
  });

  it('reports the maximum for high percentiles of a small series', () => {
    // Regression: the old formula returned 253 here while max was 443.
    const series = sorted([241, 247, 250, 253, 260, 431, 443]);
    expect(percentileOf(series, 50)).toBe(253); // nearest rank: ceil(0.5 * 7) = 4
    expect(percentileOf(series, 95)).toBe(443);
    expect(percentileOf(series, 99)).toBe(443);
  });

  it('does not collapse P95 and P99 onto the same sample for n = 20', () => {
    const series = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentileOf(series, 95)).toBe(190);
    expect(percentileOf(series, 99)).toBe(200);
    expect(percentileOf(series, 95)).not.toBe(percentileOf(series, 99));
  });

  it('keeps min <= p50 <= p95 <= p99 <= max for random series', () => {
    for (let run = 0; run < 50; run++) {
      const size = 1 + Math.floor(Math.random() * 200);
      const series = sorted(
        Array.from({ length: size }, () => Math.floor(Math.random() * 5000))
      );
      const min = series[0];
      const max = series[series.length - 1];
      const p50 = percentileOf(series, 50);
      const p95 = percentileOf(series, 95);
      const p99 = percentileOf(series, 99);

      expect(min).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
      expect(p99).toBeLessThanOrEqual(max);
    }
  });

  it('never reports a percentile below the mean when the mean is below the max', () => {
    const series = sorted([241, 247, 250, 253, 260, 431, 443]);
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    expect(percentileOf(series, 95)).toBeGreaterThanOrEqual(mean);
  });
});

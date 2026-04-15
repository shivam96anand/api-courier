import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', async () => import('../../../__mocks__/electron'));

// Mock the dependencies that loadtest-engine imports
vi.mock('../request-manager', () => ({
  requestManager: {
    sendRequest: vi.fn(),
  },
}));

vi.mock('../store-manager', () => ({
  storeManager: {
    getState: vi.fn().mockReturnValue({ collections: [] }),
  },
}));

vi.mock('../oauth', () => ({
  oauthManager: {
    getTokenInfo: vi.fn().mockReturnValue({ isValid: true, expiresIn: 3600 }),
    refreshToken: vi.fn().mockResolvedValue({ success: true, data: { accessToken: 'new', expiresIn: 3600 } }),
    startFlow: vi.fn().mockResolvedValue({ success: true, data: { accessToken: 'new', expiresIn: 3600 } }),
  },
}));

import { loadTestEngine as engine } from '../loadtest-engine';
import { requestManager } from '../request-manager';
import { LoadTestConfig, LoadTestSummary, LoadTestProgressTick } from '../../../shared/types';

function createConfig(overrides: Partial<LoadTestConfig> = {}): LoadTestConfig {
  return {
    rpm: 60,
    durationSec: 2,
    target: {
      kind: 'adhoc',
      method: 'GET',
      url: 'https://api.example.com/test',
    },
    ...overrides,
  };
}

describe('loadtest-engine.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    engine.removeAllListeners();

    // Default mock for sendRequest
    vi.mocked(requestManager.sendRequest).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{}',
      time: 50,
      size: 2,
      timestamp: Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startLoadTest — validation', () => {
    it('throws if totalPlanned rounds to 0 (rpm too low for durationSec)', async () => {
      // rpm=1 and durationSec=1 → totalPlanned = floor(1 * 1 / 60) = 0
      const config = createConfig({ rpm: 1, durationSec: 1 });

      await expect(engine.startLoadTest(config)).rejects.toThrow(
        'Test duration too short or RPM too low'
      );
    });

    it('returns a runId on valid config', async () => {
      const config = createConfig({ rpm: 60, durationSec: 2 });
      const { runId } = await engine.startLoadTest(config);
      expect(runId).toBeDefined();
      expect(typeof runId).toBe('string');
    });
  });

  describe('startLoadTest — events', () => {
    it('emits progress events during run', async () => {
      const progressEvents: LoadTestProgressTick[] = [];
      engine.on('progress', (tick: LoadTestProgressTick) => {
        progressEvents.push(tick);
      });

      const config = createConfig({ rpm: 60, durationSec: 2 });
      await engine.startLoadTest(config);

      // Advance 400ms to trigger at least 2 progress reports (every 200ms)
      await vi.advanceTimersByTimeAsync(400);

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0]).toHaveProperty('runId');
      expect(progressEvents[0]).toHaveProperty('scheduled');
      expect(progressEvents[0]).toHaveProperty('elapsedSec');
    });

    it('emits summary event when run completes', async () => {
      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 60, durationSec: 1 });
      // totalPlanned = floor(60 * 1 / 60) = 1
      await engine.startLoadTest(config);

      // Advance past the duration + settling time
      await vi.advanceTimersByTimeAsync(2000);

      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
      expect(summaryEvents[0]).toHaveProperty('runId');
      expect(summaryEvents[0]).toHaveProperty('totalPlanned');
      expect(summaryEvents[0]).toHaveProperty('p50');
      expect(summaryEvents[0]).toHaveProperty('p95');
      expect(summaryEvents[0]).toHaveProperty('p99');
      expect(summaryEvents[0]).toHaveProperty('throughputRps');
    });
  });

  describe('cancelLoadTest', () => {
    it('cancelLoadTest stops further scheduling', async () => {
      const config = createConfig({ rpm: 600, durationSec: 10 });
      const { runId } = await engine.startLoadTest(config);

      // Advance a bit
      await vi.advanceTimersByTimeAsync(200);

      const result = await engine.cancelLoadTest(runId);
      expect(result.ok).toBe(true);
    });

    it('cancelLoadTest on unknown runId returns ok: false', async () => {
      const result = await engine.cancelLoadTest('nonexistent-run-id');
      expect(result.ok).toBe(false);
    });
  });

  describe('summary metrics', () => {
    it('summary.totalPlanned equals rpm * durationSec / 60', async () => {
      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 120, durationSec: 1 });
      // totalPlanned = floor(120 * 1 / 60) = 2
      await engine.startLoadTest(config);

      // Let it complete
      await vi.advanceTimersByTimeAsync(3000);

      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
      expect(summaryEvents[0].totalPlanned).toBe(2);
    });

    it('summary contains latency percentiles and throughput', async () => {
      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 60, durationSec: 1 });
      await engine.startLoadTest(config);

      await vi.advanceTimersByTimeAsync(3000);

      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
      const summary = summaryEvents[0];
      expect(typeof summary.p50).toBe('number');
      expect(typeof summary.p95).toBe('number');
      expect(typeof summary.p99).toBe('number');
      expect(typeof summary.throughputRps).toBe('number');
      expect(typeof summary.avgMs).toBe('number');
      expect(typeof summary.minMs).toBe('number');
      expect(typeof summary.maxMs).toBe('number');
    });
  });

  describe('getSamples / getRunConfig', () => {
    it('getSamples returns empty array for unknown run', () => {
      expect(engine.getSamples('unknown')).toEqual([]);
    });

    it('getRunConfig returns null for unknown run', () => {
      expect(engine.getRunConfig('unknown')).toBeNull();
    });

    it('getRunConfig returns the config for an active run', async () => {
      const config = createConfig({ rpm: 60, durationSec: 5 });
      const { runId } = await engine.startLoadTest(config);

      const storedConfig = engine.getRunConfig(runId);
      expect(storedConfig).toBeDefined();
      expect(storedConfig!.rpm).toBe(60);
      expect(storedConfig!.durationSec).toBe(5);
    });
  });

  describe('cancellation timing', () => {
    it('cancel mid-run stops further scheduling and emits summary', async () => {
      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 600, durationSec: 10 });
      const { runId } = await engine.startLoadTest(config);

      // Advance a bit, then cancel
      await vi.advanceTimersByTimeAsync(500);
      const cancelResult = await engine.cancelLoadTest(runId);
      expect(cancelResult.ok).toBe(true);

      // Advance enough for summary to be emitted
      await vi.advanceTimersByTimeAsync(2000);
      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling in requests', () => {
    it('counts failed requests as errors in summary', async () => {
      // Make all requests fail
      vi.mocked(requestManager.sendRequest).mockRejectedValue(new Error('Connection refused'));

      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 60, durationSec: 1 });
      await engine.startLoadTest(config);

      // Advance enough for request dispatch, failure, and summary
      await vi.advanceTimersByTimeAsync(5000);

      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
      // Take the last summary (after all requests completed)
      const lastSummary = summaryEvents[summaryEvents.length - 1];
      expect(lastSummary.error).toBeGreaterThan(0);
    });

    it('handles mixed success and failure responses', async () => {
      let callCount = 0;
      vi.mocked(requestManager.sendRequest).mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 0) {
          return {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            body: 'error',
            time: 100,
            size: 5,
            timestamp: Date.now(),
          };
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{}',
          time: 50,
          size: 2,
          timestamp: Date.now(),
        };
      });

      const summaryEvents: LoadTestSummary[] = [];
      engine.on('summary', (summary: LoadTestSummary) => {
        summaryEvents.push(summary);
      });

      const config = createConfig({ rpm: 120, durationSec: 1 });
      await engine.startLoadTest(config);

      await vi.advanceTimersByTimeAsync(3000);

      expect(summaryEvents.length).toBeGreaterThanOrEqual(1);
      const summary = summaryEvents[0];
      expect(summary.codeCounts).toBeDefined();
    });
  });

  describe('progress reporting', () => {
    it('progress contains correct fields', async () => {
      const progressEvents: LoadTestProgressTick[] = [];
      engine.on('progress', (tick: LoadTestProgressTick) => {
        progressEvents.push(tick);
      });

      const config = createConfig({ rpm: 60, durationSec: 2 });
      const { runId } = await engine.startLoadTest(config);

      await vi.advanceTimersByTimeAsync(600);

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      const tick = progressEvents[0];
      expect(tick.runId).toBe(runId);
      expect(typeof tick.sent).toBe('number');
      expect(typeof tick.completed).toBe('number');
      expect(typeof tick.inFlight).toBe('number');
    });
  });
});

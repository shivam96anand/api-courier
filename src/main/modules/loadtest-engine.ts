import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { LoadTestConfig, LoadTestProgressTick, LoadSample, LoadTestSummary, ApiRequest, LoadTestTarget } from '../../shared/types';
import { requestManager } from './request-manager';
import { storeManager } from './store-manager';

interface ActiveRun {
  id: string;
  config: LoadTestConfig;
  samples: LoadSample[];
  scheduled: number;
  sent: number;
  completed: number;
  inFlight: number;
  startedAt: number;
  cancelled: boolean;
  tokenBucket: number;
  timer?: NodeJS.Timeout;
  progressTimer?: NodeJS.Timeout;
}

class LoadTestEngine extends EventEmitter {
  private activeRuns = new Map<string, ActiveRun>();
  private readonly MAX_CONCURRENT_REQUESTS = 32;

  async startLoadTest(config: LoadTestConfig): Promise<{ runId: string }> {
    const runId = randomUUID();
    const totalPlanned = Math.floor((config.rpm * config.durationSec) / 60);

    if (totalPlanned === 0) {
      throw new Error('Test duration too short or RPM too low');
    }

    const run: ActiveRun = {
      id: runId,
      config,
      samples: [],
      scheduled: 0,
      sent: 0,
      completed: 0,
      inFlight: 0,
      startedAt: Date.now(),
      cancelled: false,
      tokenBucket: 0,
    };

    this.activeRuns.set(runId, run);
    this.scheduleRequests(run);
    this.startProgressReporting(run);

    // Schedule test completion - but don't stop until all scheduled requests finish
    setTimeout(() => {
      // Before cancelling, flush remaining tokens to ensure we reach totalPlanned
      const totalPlanned = Math.floor((config.rpm * config.durationSec) / 60);
      const remaining = totalPlanned - run.scheduled;

      if (remaining > 0) {
        console.log(`Flushing ${remaining} remaining requests before cancellation`);
        for (let i = 0; i < remaining && run.scheduled < totalPlanned; i++) {
          run.scheduled++;
          this.dispatchRequest(run);
        }
      }

      run.cancelled = true; // Stop scheduling new requests
      // completeRun will be called when all in-flight requests finish
      if (run.inFlight === 0) {
        this.completeRun(runId);
      }
    }, config.durationSec * 1000);

    return { runId };
  }

  async cancelLoadTest(runId: string): Promise<{ ok: boolean }> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return { ok: false };
    }

    run.cancelled = true;
    this.completeRun(runId);
    return { ok: true };
  }

  private scheduleRequests(run: ActiveRun): void {
    const ratePerSec = run.config.rpm / 60;
    const totalPlanned = Math.floor((run.config.rpm * run.config.durationSec) / 60);
    const concurrencyLimit = Math.min(this.MAX_CONCURRENT_REQUESTS, Math.ceil(run.config.rpm / 10));

    console.log(`Scheduling: RPM=${run.config.rpm}, Duration=${run.config.durationSec}s, TotalPlanned=${totalPlanned}, RatePerSec=${ratePerSec}`);

    run.timer = setInterval(() => {
      if (run.cancelled || run.scheduled >= totalPlanned) {
        if (run.scheduled >= totalPlanned) {
          console.log(`Scheduling complete: ${run.scheduled}/${totalPlanned} requests scheduled`);
        }
        return;
      }

      // Add tokens to bucket (accumulate fractional requests)
      run.tokenBucket += ratePerSec / 10; // 100ms intervals

      // Dispatch requests while we have tokens and capacity
      let dispatched = 0;
      while (
        run.tokenBucket >= 1 &&
        run.inFlight < concurrencyLimit &&
        run.scheduled < totalPlanned &&
        !run.cancelled
      ) {
        run.tokenBucket -= 1;
        run.scheduled++;
        dispatched++;
        this.dispatchRequest(run);
      }

      if (dispatched > 0) {
        console.log(`Interval: scheduled=${run.scheduled}/${totalPlanned}, bucket=${run.tokenBucket.toFixed(3)}, dispatched=${dispatched}`);
      }
    }, 100); // 100ms intervals for smooth rate limiting
  }

  private async dispatchRequest(run: ActiveRun): Promise<void> {
    const requestData = await this.resolveTarget(run.config.target);

    run.sent++;
    run.inFlight++;

    if (!requestData) {
      this.recordSample(run, {
        t0: Date.now(),
        durationMs: 0,
        error: 'Failed to resolve target request',
      });
      run.inFlight--;
      run.completed++;
      console.log(`Request resolution failed - Samples: ${run.samples.length}, Completed: ${run.completed}`);

      // Check if test should complete (all scheduled requests finished and time expired)
      if (run.cancelled && run.inFlight === 0) {
        this.completeRun(run.id);
      }
      return;
    }

    const startTime = Date.now();

    try {
      const response = await requestManager.sendRequest(requestData);
      const endTime = Date.now();

      this.recordSample(run, {
        t0: startTime,
        durationMs: endTime - startTime,
        status: response.status,
        bytes: response.size,
        error: response.status === 0 ? response.statusText : null,
      });
    } catch (error) {
      const endTime = Date.now();
      this.recordSample(run, {
        t0: startTime,
        durationMs: endTime - startTime,
        error: error instanceof Error ? error.message : 'Request failed',
      });
    } finally {
      run.inFlight--;
      run.completed++;

      // Check if test should complete (all scheduled requests finished and time expired)
      if (run.cancelled && run.inFlight === 0) {
        this.completeRun(run.id);
      }
    }
  }

  private async resolveTarget(target: LoadTestTarget): Promise<ApiRequest | null> {
    if (target.kind === 'collection') {
      const state = storeManager.getState();
      const collection = this.findRequestInCollections(state.collections, target.requestId);
      return collection?.request || null;
    } else {
      // Convert LoadTestTargetAdHoc to ApiRequest
      return {
        id: randomUUID(),
        name: 'Load Test Request',
        method: target.method,
        url: target.url,
        params: target.params ? Object.fromEntries(
          Object.entries(target.params).map(([k, v]) => [k, String(v)])
        ) : {},
        headers: target.headers || {},
        body: target.body ? {
          type: target.body.type,
          content: target.body.content,
          format: target.body.format,
          contentType: target.body.contentType,
        } : undefined,
        auth: target.auth ? {
          type: target.auth.type === 'apikey' ? 'api-key' :
                target.auth.type === 'oauth2' ? 'bearer' : target.auth.type,
          config: target.auth.data as Record<string, string> || {},
        } : undefined,
      };
    }
  }

  private findRequestInCollections(collections: any[], requestId: string): any {
    for (const collection of collections) {
      if (collection.request?.id === requestId) {
        return collection;
      }
      if (collection.children) {
        const found = this.findRequestInCollections(collection.children, requestId);
        if (found) return found;
      }
    }
    return null;
  }

  private recordSample(run: ActiveRun, sample: LoadSample): void {
    run.samples.push(sample);
    if (sample.error) {
      console.log(`Recorded error sample: ${sample.error}, Total samples: ${run.samples.length}`);
    }
  }

  private startProgressReporting(run: ActiveRun): void {
    run.progressTimer = setInterval(() => {
      if (run.cancelled) return;

      const elapsedSec = (Date.now() - run.startedAt) / 1000;
      const progress: LoadTestProgressTick = {
        runId: run.id,
        scheduled: run.scheduled,
        sent: run.sent,
        completed: run.completed,
        inFlight: run.inFlight,
        elapsedSec,
      };

      this.emit('progress', progress);
    }, 200); // Emit progress every 200ms
  }

  private completeRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    // Clear timers
    if (run.timer) clearInterval(run.timer);
    if (run.progressTimer) clearInterval(run.progressTimer);

    // Wait for in-flight requests to complete (with timeout)
    const waitForCompletion = () => {
      if (run.inFlight === 0 || Date.now() - run.startedAt > (run.config.durationSec + 10) * 1000) {
        this.generateSummary(run);
      } else {
        setTimeout(waitForCompletion, 100);
      }
    };

    waitForCompletion();
  }

  private generateSummary(run: ActiveRun): void {
    const actualFinishedAt = Date.now();
    const actualWallTimeMs = actualFinishedAt - run.startedAt;
    // Cap both wall time and finished time to the configured duration
    const wallTimeMs = Math.min(actualWallTimeMs, run.config.durationSec * 1000);
    const finishedAt = run.startedAt + wallTimeMs; // Use capped time for display
    const totalPlanned = Math.floor((run.config.rpm * run.config.durationSec) / 60);

    console.log(`Load test summary - Samples: ${run.samples.length}, Planned: ${totalPlanned}, Sent: ${run.sent}, Completed: ${run.completed}`);

    // Calculate response code counts
    const codeCounts: Record<string, number> = {};
    let successCount = 0;
    let errorCount = 0;

    const durations: number[] = [];

    for (const sample of run.samples) {
      durations.push(sample.durationMs);

      if (sample.status !== undefined) {
        const statusStr = sample.status.toString();
        codeCounts[statusStr] = (codeCounts[statusStr] || 0) + 1;

        if (sample.status >= 200 && sample.status < 400) {
          successCount++;
        } else {
          errorCount++;
        }
      } else if (sample.error) {
        errorCount++;
        codeCounts['error'] = (codeCounts['error'] || 0) + 1;
      }
    }

    // Calculate latency percentiles
    durations.sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (durations.length === 0) return 0;
      const index = Math.floor((p / 100) * (durations.length - 1));
      return durations[index] || 0;
    };

    const summary: LoadTestSummary = {
      runId: run.id,
      totalPlanned,
      sent: run.sent,
      completed: run.samples.length, // Use actual sample count instead of run.completed
      success: successCount,
      error: errorCount,
      codeCounts,
      minMs: durations.length > 0 ? durations[0] : 0,
      maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
      avgMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
      throughputRps: wallTimeMs > 0 ? (run.samples.length * 1000) / wallTimeMs : 0, // Use sample count for throughput too
      wallTimeMs,
      startedAt: run.startedAt,
      finishedAt,
    };

    this.emit('summary', summary);

    // Keep samples in memory for export but remove from active runs
    // Store samples temporarily for exports
    setTimeout(() => {
      this.activeRuns.delete(run.id);
    }, 300000); // Keep for 5 minutes for exports
  }

  getSamples(runId: string): LoadSample[] {
    const run = this.activeRuns.get(runId);
    return run ? run.samples : [];
  }

  getRunConfig(runId: string): LoadTestConfig | null {
    const run = this.activeRuns.get(runId);
    return run ? run.config : null;
  }
}

export const loadTestEngine = new LoadTestEngine();

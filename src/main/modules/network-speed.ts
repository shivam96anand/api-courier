/**
 * Network speed test (download + upload) implemented in the main process.
 *
 * Uses Cloudflare's public speed-test endpoints (`speed.cloudflare.com`) with
 * multiple parallel streams and a warm-up period for accurate measurements.
 *
 * Flow:
 *   - PING:     GET /__down?bytes=0  (time-to-first-byte)
 *   - DOWNLOAD: 4 parallel GET /__down for ~7 s, discard first 1.5 s (TCP slow-start)
 *   - UPLOAD:   4 parallel POST /__up for ~6 s, same warm-up
 *
 * Total test duration: ~14 s (10–15 s range).
 */
import { request as httpsRequest } from 'https';
import { randomBytes } from 'crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';

const HOST = 'speed.cloudflare.com';
// Pretend to be a request originating from speed.cloudflare.com itself.
// Cloudflare's bot-management rejects requests with missing/odd User-Agent or
// missing Origin/Referer with HTTP 403, especially for larger byte counts.
const DEFAULT_HEADERS: Record<string, string | number> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Encoding': 'identity',
  Origin: 'https://speed.cloudflare.com',
  Referer: 'https://speed.cloudflare.com/',
};
const STREAMS = 4; // parallel connections
const DL_DURATION_MS = 7_000; // download phase length
const UL_DURATION_MS = 6_000; // upload phase length
const WARMUP_MS = 1_500; // discard TCP slow-start
// Per-request payload size. Cloudflare's anti-abuse layer can reject very
// large `__down?bytes=` / `__up` requests with 403 in some regions, so we
// stay at 25 MB — matching the size used by Cloudflare's own speedtest
// engine (@cloudflare/speedtest defaultConfig). Streams that finish before
// the phase timer simply settle early; the engine handles that.
const DL_BYTES_PER_STREAM = 25_000_000;
const UL_BYTES_PER_STREAM = 25_000_000;
const UL_CHUNK = 64 * 1024; // write chunk size
const HARD_TIMEOUT_MS = 30_000; // per-request safety timeout
const EMIT_MS = 120; // progress update interval
// Final-result reduction (Ookla-style). We bucket post-warmup bytes into
// short slices and report a trimmed mean — this matches what users see on
// fast.com and speedtest.net far better than a flat mean of the full run,
// because it discards TCP slow-start and brief network stalls.
const SLICE_MS = 250; // slice width for per-slice throughput
const TRIM_LOW = 0.3; // drop the slowest 30%
const TRIM_HIGH = 0.1; // drop the fastest 10%

export interface SpeedTestProgress {
  phase: 'starting' | 'download' | 'upload' | 'done' | 'error';
  /** Mbps for the current phase (0 if unknown). */
  mbps: number;
  /** 0..1 progress of the current phase. */
  ratio: number;
}

export interface SpeedTestResult {
  ok: boolean;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  error?: string;
}

let activeAbort: (() => void) | null = null;

export function cancelSpeedTest(): void {
  activeAbort?.();
  activeAbort = null;
}

export async function runSpeedTest(
  window: BrowserWindow | null
): Promise<SpeedTestResult> {
  // Ensure only one runs at a time.
  cancelSpeedTest();

  let aborted = false;
  activeAbort = () => {
    aborted = true;
  };

  const emit = (progress: SpeedTestProgress): void => {
    if (!window || window.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.NETWORK_SPEED_TEST_PROGRESS, progress);
  };

  const isAborted = (): boolean => aborted;

  try {
    emit({ phase: 'starting', mbps: 0, ratio: 0 });

    const pingMs = await measurePing(isAborted);
    if (aborted) throw new Error('cancelled');

    const downloadMbps = await measureDownload(emit, isAborted);
    if (aborted) throw new Error('cancelled');

    const uploadMbps = await measureUpload(emit, isAborted);
    if (aborted) throw new Error('cancelled');

    emit({ phase: 'done', mbps: 0, ratio: 1 });
    activeAbort = null;
    return { ok: true, downloadMbps, uploadMbps, pingMs };
  } catch (err) {
    activeAbort = null;
    const message = err instanceof Error ? err.message : 'Unknown error';
    emit({ phase: 'error', mbps: 0, ratio: 0 });
    return {
      ok: false,
      downloadMbps: 0,
      uploadMbps: 0,
      pingMs: 0,
      error: message,
    };
  }
}

function measurePing(isAborted: () => boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const opts: RequestOptions = {
      method: 'GET',
      host: HOST,
      path: '/__down?bytes=0',
      headers: { ...DEFAULT_HEADERS },
      timeout: 5_000,
    };
    const req = httpsRequest(opts, (res: IncomingMessage) => {
      const ttfb = Date.now() - start;
      res.resume();
      res.on('end', () => resolve(ttfb));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('ping timeout'));
    });
    if (isAborted()) req.destroy(new Error('cancelled'));
    req.end();
  });
}

function measureDownload(
  emit: (p: SpeedTestProgress) => void,
  isAborted: () => boolean
): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let totalBytes = 0,
      warmupBytes = 0,
      warmupEnd = 0,
      lastEmit = 0;
    let warmedUp = false,
      settled = false;
    const reqs = new Set<ClientRequest>();
    const tracker = new SliceTracker();

    const liveMbps = (): number =>
      warmedUp
        ? bytesToMbps(
            totalBytes - warmupBytes,
            Math.max((Date.now() - warmupEnd) / 1000, 0.001)
          )
        : bytesToMbps(totalBytes, Math.max((Date.now() - start) / 1000, 0.001));
    const finalMbps = (): number => {
      const trimmed = tracker.mbpsTrimmedMean();
      // Fallback to running mean if the test was too short to slice.
      return trimmed > 0 ? trimmed : liveMbps();
    };
    const teardown = (): void => {
      clearTimeout(timer);
      for (const r of reqs) r.destroy();
      reqs.clear();
    };
    const settle = (): void => {
      if (settled) return;
      settled = true;
      teardown();
      const result = finalMbps();
      emit({ phase: 'download', mbps: result, ratio: 1 });
      resolve(result);
    };
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      teardown();
      reject(err);
    };
    const timer = setTimeout(settle, DL_DURATION_MS);

    const launchStream = (): void => {
      if (settled) return;
      const req = httpsRequest(
        {
          method: 'GET',
          host: HOST,
          path: `/__down?bytes=${DL_BYTES_PER_STREAM}`,
          headers: { ...DEFAULT_HEADERS },
          timeout: HARD_TIMEOUT_MS,
        },
        (res: IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 400) {
            fail(new Error(`download HTTP ${res.statusCode}`));
            return;
          }
          res.on('data', (chunk: Buffer) => {
            if (isAborted()) {
              fail(new Error('cancelled'));
              return;
            }
            totalBytes += chunk.length;
            const now = Date.now(),
              elapsed = now - start;
            if (!warmedUp && elapsed >= WARMUP_MS) {
              warmedUp = true;
              warmupBytes = totalBytes;
              warmupEnd = now;
              tracker.start(now);
            }
            if (warmedUp) tracker.add(chunk.length, now);
            if (now - lastEmit > EMIT_MS) {
              lastEmit = now;
              emit({
                phase: 'download',
                mbps: liveMbps(),
                ratio: Math.min(elapsed / DL_DURATION_MS, 0.99),
              });
            }
          });
          res.on('end', () => {
            reqs.delete(req);
            // Re-launch on a fast connection so the pipe stays full until
            // the phase timer fires.
            if (!settled) launchStream();
          });
          res.on('error', (e) => fail(e));
        }
      );
      req.on('error', (e) => fail(e));
      req.on('timeout', () => req.destroy(new Error('download timeout')));
      reqs.add(req);
      req.end();
    };

    for (let i = 0; i < STREAMS; i++) launchStream();
  });
}

function measureUpload(
  emit: (p: SpeedTestProgress) => void,
  isAborted: () => boolean
): Promise<number> {
  return new Promise((resolve, reject) => {
    const buf = randomBytes(UL_CHUNK);
    const start = Date.now();
    let totalBytes = 0,
      warmupBytes = 0,
      warmupEnd = 0,
      lastEmit = 0;
    let warmedUp = false,
      settled = false;
    const reqs = new Set<ClientRequest>();
    const tracker = new SliceTracker();

    const liveMbps = (): number =>
      warmedUp
        ? bytesToMbps(
            totalBytes - warmupBytes,
            Math.max((Date.now() - warmupEnd) / 1000, 0.001)
          )
        : bytesToMbps(totalBytes, Math.max((Date.now() - start) / 1000, 0.001));
    const finalMbps = (): number => {
      const trimmed = tracker.mbpsTrimmedMean();
      return trimmed > 0 ? trimmed : liveMbps();
    };
    const teardown = (): void => {
      clearTimeout(timer);
      for (const r of reqs) r.destroy();
      reqs.clear();
    };
    const settle = (): void => {
      if (settled) return;
      settled = true;
      teardown();
      const result = finalMbps();
      emit({ phase: 'upload', mbps: result, ratio: 1 });
      resolve(result);
    };
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      teardown();
      reject(err);
    };
    const timer = setTimeout(settle, UL_DURATION_MS);

    const launchStream = (): void => {
      if (settled) return;
      let written = 0;
      const req = httpsRequest(
        {
          method: 'POST',
          host: HOST,
          path: '/__up',
          headers: {
            ...DEFAULT_HEADERS,
            'Content-Type': 'application/octet-stream',
            'Content-Length': UL_BYTES_PER_STREAM,
          },
          timeout: HARD_TIMEOUT_MS,
        },
        (res: IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 400) {
            fail(new Error(`upload HTTP ${res.statusCode}`));
            return;
          }
          res.resume();
          res.on('end', () => {
            reqs.delete(req);
            // Re-launch on a fast connection so the pipe stays full until
            // the phase timer fires.
            if (!settled) launchStream();
          });
          res.on('error', (e) => fail(e));
        }
      );
      req.on('error', (e) => fail(e));
      req.on('timeout', () => req.destroy(new Error('upload timeout')));
      reqs.add(req);

      const pump = (): void => {
        if (settled || isAborted()) {
          if (isAborted() && !settled) fail(new Error('cancelled'));
          return;
        }
        let ok = true;
        while (ok && !settled && written < UL_BYTES_PER_STREAM) {
          const remaining = UL_BYTES_PER_STREAM - written;
          const chunk =
            remaining >= buf.length ? buf : buf.subarray(0, remaining);
          written += chunk.length;
          totalBytes += chunk.length;
          const now = Date.now(),
            elapsed = now - start;
          if (!warmedUp && elapsed >= WARMUP_MS) {
            warmedUp = true;
            warmupBytes = totalBytes;
            warmupEnd = now;
            tracker.start(now);
          }
          if (warmedUp) tracker.add(chunk.length, now);
          if (now - lastEmit > EMIT_MS) {
            lastEmit = now;
            emit({
              phase: 'upload',
              mbps: liveMbps(),
              ratio: Math.min(elapsed / UL_DURATION_MS, 0.99),
            });
          }
          ok = req.write(chunk);
        }
        if (settled) return;
        if (written >= UL_BYTES_PER_STREAM) {
          req.end();
          return;
        }
        req.once('drain', pump);
      };
      pump();
    };

    for (let i = 0; i < STREAMS; i++) launchStream();
  });
}

function bytesToMbps(bytes: number, seconds: number): number {
  // bytes → bits → Mbps
  return (bytes * 8) / seconds / 1_000_000;
}

/**
 * Buckets bytes added after warmup into fixed-width time slices. The
 * `mbpsTrimmedMean()` getter returns an Ookla-style trimmed mean of the
 * per-slice Mbps values (drops slowest 30% and fastest 10%), which closely
 * matches the headline numbers shown by fast.com and speedtest.net.
 */
class SliceTracker {
  private slices: number[] = [];
  private startTs = 0;
  private currentSliceIdx = -1;

  start(at: number): void {
    this.startTs = at;
    this.slices = [];
    this.currentSliceIdx = -1;
  }

  add(bytes: number, at: number): void {
    if (this.startTs === 0) return;
    const idx = Math.floor((at - this.startTs) / SLICE_MS);
    if (idx < 0) return;
    if (idx > this.currentSliceIdx) {
      // Pad any missing slots (e.g. brief stall) with 0-byte slices so they
      // get trimmed out as the slow tail rather than ignored.
      while (this.slices.length <= idx) this.slices.push(0);
      this.currentSliceIdx = idx;
    }
    this.slices[idx] += bytes;
  }

  /** Trimmed mean Mbps; falls back to a simple mean if too few slices. */
  mbpsTrimmedMean(): number {
    // Drop the in-progress final slice — it's typically partial.
    const closed = this.slices.slice(0, -1);
    if (closed.length === 0) return 0;

    const perSliceMbps = closed.map((b) => bytesToMbps(b, SLICE_MS / 1000));

    if (perSliceMbps.length < 5) {
      // Not enough samples to meaningfully trim — return the mean.
      return perSliceMbps.reduce((s, v) => s + v, 0) / perSliceMbps.length;
    }

    const sorted = [...perSliceMbps].sort((a, b) => a - b);
    const lo = Math.floor(sorted.length * TRIM_LOW);
    const hi = Math.max(
      lo + 1,
      sorted.length - Math.floor(sorted.length * TRIM_HIGH)
    );
    const kept = sorted.slice(lo, hi);
    return kept.reduce((s, v) => s + v, 0) / kept.length;
  }
}

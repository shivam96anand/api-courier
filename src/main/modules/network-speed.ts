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
// Cloudflare returns 403 for requests without a recognizable User-Agent
// (bot/abuse protection), so identify ourselves as a real client.
const DEFAULT_HEADERS: Record<string, string | number> = {
  'User-Agent':
    'Mozilla/5.0 (Restbro Speed Test) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Encoding': 'identity',
};
const STREAMS = 4; // parallel connections
const DL_DURATION_MS = 7_000; // download phase length
const UL_DURATION_MS = 6_000; // upload phase length
const WARMUP_MS = 1_500; // discard TCP slow-start
const DL_BYTES_PER_STREAM = 200 * 1024 * 1024; // request size (aborted early)
const UL_BYTES_PER_STREAM = 200 * 1024 * 1024; // max upload per stream
const UL_CHUNK = 64 * 1024; // write chunk size
const HARD_TIMEOUT_MS = 30_000; // per-request safety timeout
const EMIT_MS = 120; // progress update interval

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
      lastEmit = 0,
      ended = 0;
    let warmedUp = false,
      settled = false;
    const reqs: ClientRequest[] = [];

    const mbps = (): number =>
      warmedUp
        ? bytesToMbps(
            totalBytes - warmupBytes,
            Math.max((Date.now() - warmupEnd) / 1000, 0.001)
          )
        : bytesToMbps(totalBytes, Math.max((Date.now() - start) / 1000, 0.001));
    const teardown = (): void => {
      clearTimeout(timer);
      for (const r of reqs) r.destroy();
    };
    const settle = (): void => {
      if (settled) return;
      settled = true;
      teardown();
      emit({ phase: 'download', mbps: mbps(), ratio: 1 });
      resolve(mbps());
    };
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      teardown();
      reject(err);
    };
    const timer = setTimeout(settle, DL_DURATION_MS);

    for (let i = 0; i < STREAMS; i++) {
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
            }
            if (now - lastEmit > EMIT_MS) {
              lastEmit = now;
              emit({
                phase: 'download',
                mbps: mbps(),
                ratio: Math.min(elapsed / DL_DURATION_MS, 0.99),
              });
            }
          });
          res.on('end', () => {
            if (++ended === STREAMS) settle();
          });
          res.on('error', (e) => fail(e));
        }
      );
      req.on('error', (e) => fail(e));
      req.on('timeout', () => req.destroy(new Error('download timeout')));
      reqs.push(req);
      req.end();
    }
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
      lastEmit = 0,
      ended = 0;
    let warmedUp = false,
      settled = false;
    const reqs: ClientRequest[] = [];

    const mbps = (): number =>
      warmedUp
        ? bytesToMbps(
            totalBytes - warmupBytes,
            Math.max((Date.now() - warmupEnd) / 1000, 0.001)
          )
        : bytesToMbps(totalBytes, Math.max((Date.now() - start) / 1000, 0.001));
    const teardown = (): void => {
      clearTimeout(timer);
      for (const r of reqs) r.destroy();
    };
    const settle = (): void => {
      if (settled) return;
      settled = true;
      teardown();
      emit({ phase: 'upload', mbps: mbps(), ratio: 1 });
      resolve(mbps());
    };
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      teardown();
      reject(err);
    };
    const timer = setTimeout(settle, UL_DURATION_MS);

    for (let i = 0; i < STREAMS; i++) {
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
            if (++ended === STREAMS) settle();
          });
          res.on('error', (e) => fail(e));
        }
      );
      req.on('error', (e) => fail(e));
      req.on('timeout', () => req.destroy(new Error('upload timeout')));
      reqs.push(req);

      const pump = (): void => {
        if (settled || isAborted()) {
          if (isAborted() && !settled) fail(new Error('cancelled'));
          return;
        }
        let ok = true;
        while (ok && !settled) {
          totalBytes += buf.length;
          const now = Date.now(),
            elapsed = now - start;
          if (!warmedUp && elapsed >= WARMUP_MS) {
            warmedUp = true;
            warmupBytes = totalBytes;
            warmupEnd = now;
          }
          if (now - lastEmit > EMIT_MS) {
            lastEmit = now;
            emit({
              phase: 'upload',
              mbps: mbps(),
              ratio: Math.min(elapsed / UL_DURATION_MS, 0.99),
            });
          }
          ok = req.write(buf);
        }
        if (!settled) req.once('drain', pump);
      };
      pump();
    }
  });
}

function bytesToMbps(bytes: number, seconds: number): number {
  // bytes → bits → Mbps
  return (bytes * 8) / seconds / 1_000_000;
}

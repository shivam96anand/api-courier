/**
 * Network speed test (download + upload) implemented in the main process.
 *
 * Uses Cloudflare's public speed-test endpoints (`speed.cloudflare.com`) to
 * measure throughput in megabits per second. These are the same endpoints
 * Cloudflare's own speed test page uses, are CORS/HTTPS-friendly, and do
 * not require any account or telemetry.
 *
 * Flow:
 *   - DOWNLOAD: GET https://speed.cloudflare.com/__down?bytes=<N>
 *   - UPLOAD:   POST https://speed.cloudflare.com/__up   (body of N random bytes)
 *
 * The renderer triggers a run via `runSpeedTest()`; live progress is emitted
 * to the renderer over the `NETWORK_SPEED_TEST_PROGRESS` IPC channel and the
 * final summary is returned from the invoke promise.
 */
import { request as httpsRequest } from 'https';
import { randomBytes } from 'crypto';
import type { IncomingMessage, RequestOptions } from 'http';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';

const HOST = 'speed.cloudflare.com';
const DOWNLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const HARD_TIMEOUT_MS = 30_000;

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
    const opts: RequestOptions = {
      method: 'GET',
      host: HOST,
      path: `/__down?bytes=${DOWNLOAD_BYTES}`,
      timeout: HARD_TIMEOUT_MS,
    };
    const start = Date.now();
    let received = 0;
    let lastEmit = 0;

    const req = httpsRequest(opts, (res: IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`download HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (chunk: Buffer) => {
        if (isAborted()) {
          req.destroy(new Error('cancelled'));
          return;
        }
        received += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 120) {
          lastEmit = now;
          const elapsedSec = Math.max((now - start) / 1000, 0.001);
          emit({
            phase: 'download',
            mbps: bytesToMbps(received, elapsedSec),
            ratio: Math.min(received / DOWNLOAD_BYTES, 1),
          });
        }
      });
      res.on('end', () => {
        const elapsedSec = Math.max((Date.now() - start) / 1000, 0.001);
        const mbps = bytesToMbps(received, elapsedSec);
        emit({ phase: 'download', mbps, ratio: 1 });
        resolve(mbps);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('download timeout')));
    req.end();
  });
}

function measureUpload(
  emit: (p: SpeedTestProgress) => void,
  isAborted: () => boolean
): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = randomBytes(UPLOAD_BYTES);

    const opts: RequestOptions = {
      method: 'POST',
      host: HOST,
      path: '/__up',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': payload.length,
      },
      timeout: HARD_TIMEOUT_MS,
    };

    const start = Date.now();
    let sent = 0;
    let lastEmit = 0;
    const CHUNK = 64 * 1024;

    const req = httpsRequest(opts, (res: IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`upload HTTP ${res.statusCode}`));
        return;
      }
      res.resume();
      res.on('end', () => {
        const elapsedSec = Math.max((Date.now() - start) / 1000, 0.001);
        const mbps = bytesToMbps(payload.length, elapsedSec);
        emit({ phase: 'upload', mbps, ratio: 1 });
        resolve(mbps);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('upload timeout')));

    const writeNext = (): void => {
      if (isAborted()) {
        req.destroy(new Error('cancelled'));
        return;
      }
      while (sent < payload.length) {
        const end = Math.min(sent + CHUNK, payload.length);
        const slice = payload.subarray(sent, end);
        sent = end;

        const now = Date.now();
        if (now - lastEmit > 120) {
          lastEmit = now;
          const elapsedSec = Math.max((now - start) / 1000, 0.001);
          emit({
            phase: 'upload',
            mbps: bytesToMbps(sent, elapsedSec),
            ratio: Math.min(sent / payload.length, 1),
          });
        }

        const ok = req.write(slice);
        if (!ok) {
          req.once('drain', writeNext);
          return;
        }
      }
      req.end();
    };
    writeNext();
  });
}

function bytesToMbps(bytes: number, seconds: number): number {
  // bytes → bits → Mbps
  return (bytes * 8) / seconds / 1_000_000;
}

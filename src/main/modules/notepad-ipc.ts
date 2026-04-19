/**
 * Notepad IPC handlers — file open/save/read/reveal + OS file-association support.
 *
 * Security:
 * - Validates payload sizes to prevent OOM (MAX_CONTENT_BYTES).
 * - Sanitises caller-supplied default file names with path.basename to prevent
 *   directory traversal in the save dialog default path.
 * - Returns structured `{ ok, code, error }` results so the renderer can show
 *   actionable toasts instead of the generic "save failed".
 */
import { ipcMain, dialog, shell, app, clipboard } from 'electron';
import { readFile, writeFile, stat } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/ipc';
import { windowManager } from './window-manager';

/** Hard cap on a single file payload (50 MB). */
const MAX_CONTENT_BYTES = 50 * 1024 * 1024;
/** Hard cap on a file we will read into a string (50 MB). */
const MAX_READ_BYTES = 50 * 1024 * 1024;

const FILE_FILTERS = [
  {
    name: 'Text Files',
    extensions: [
      'txt',
      'md',
      'markdown',
      'log',
      'json',
      'jsonc',
      'yaml',
      'yml',
      'xml',
      'html',
      'css',
      'scss',
      'js',
      'mjs',
      'ts',
      'tsx',
      'jsx',
      'py',
      'sh',
      'sql',
      'csv',
      'env',
      'ini',
      'toml',
      'conf',
    ],
  },
  { name: 'All Files', extensions: ['*'] },
];

function err(code: string, message: string) {
  return { ok: false, canceled: false, code, error: message } as const;
}

function safeDefaultName(name: string | undefined): string {
  const fallback = 'Untitled.txt';
  if (!name || typeof name !== 'string') return fallback;
  const base = path.basename(name).trim();
  return base || fallback;
}

/** Pending file paths queued before the renderer was ready. */
const pendingFiles: string[] = [];

/** Track outstanding "before-quit" requests so renderer can answer. */
const quitDecisionResolvers = new Map<string, (canQuit: boolean) => void>();

export const notepadIpc = {
  /**
   * Queue a file path to be opened as soon as the renderer is ready.
   * Used by macOS `app.on('open-file')` and `second-instance` handlers.
   */
  queueOpenFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') return;
    const win = windowManager.getMainWindow();
    if (win && !win.webContents.isLoading()) {
      win.webContents.send(IPC_CHANNELS.NOTEPAD_FILE_OPENED, filePath);
      win.show();
      win.focus();
      return;
    }
    pendingFiles.push(filePath);
  },

  /**
   * Ask the renderer (over IPC) whether it's safe to quit.
   * Returns `true` if the renderer says ok or fails to respond within timeout.
   */
  requestQuitDecision(timeoutMs = 10_000): Promise<boolean> {
    const win = windowManager.getMainWindow();
    if (!win || win.isDestroyed()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        quitDecisionResolvers.delete(id);
        resolve(true);
      }, timeoutMs);
      quitDecisionResolvers.set(id, (canQuit) => {
        clearTimeout(timer);
        quitDecisionResolvers.delete(id);
        resolve(canQuit);
      });
      win.webContents.send(IPC_CHANNELS.NOTEPAD_BEFORE_QUIT, id);
    });
  },

  initialize(): void {
    ipcMain.handle(
      IPC_CHANNELS.NOTEPAD_SAVE_FILE,
      async (
        _,
        args: { filePath?: string; content: string; defaultName?: string }
      ) => {
        if (!args || typeof args !== 'object') {
          return err('INVALID_ARGS', 'Invalid save payload');
        }
        const { filePath, content, defaultName } = args;
        if (typeof content !== 'string') {
          return err('INVALID_ARGS', 'File content must be a string');
        }
        if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
          return err(
            'TOO_LARGE',
            `File exceeds ${Math.round(MAX_CONTENT_BYTES / (1024 * 1024))} MB limit`
          );
        }
        if (filePath && typeof filePath !== 'string') {
          return err('INVALID_ARGS', 'filePath must be a string');
        }

        try {
          let targetPath = filePath;
          if (!targetPath) {
            const result = await dialog.showSaveDialog({
              defaultPath: safeDefaultName(defaultName),
              filters: FILE_FILTERS,
            });
            if (result.canceled || !result.filePath) {
              return { ok: false, canceled: true } as const;
            }
            targetPath = result.filePath;
          }
          await writeFile(targetPath, content, 'utf-8');
          return { ok: true, canceled: false, filePath: targetPath } as const;
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Failed to save file';
          const code =
            (e as NodeJS.ErrnoException)?.code === 'EACCES'
              ? 'PERMISSION_DENIED'
              : (e as NodeJS.ErrnoException)?.code === 'ENOSPC'
                ? 'DISK_FULL'
                : (e as NodeJS.ErrnoException)?.code === 'EROFS'
                  ? 'READ_ONLY_FS'
                  : 'SAVE_FAILED';
          return err(code, message);
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_OPEN_FILE, async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: FILE_FILTERS,
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true };
        }
        const filePath = result.filePaths[0];
        const fileStat = await stat(filePath);
        if (fileStat.size > MAX_READ_BYTES) {
          return {
            canceled: false,
            error: `File too large (${Math.round(
              fileStat.size / (1024 * 1024)
            )} MB). Maximum supported is ${Math.round(
              MAX_READ_BYTES / (1024 * 1024)
            )} MB.`,
          };
        }
        const content = await readFile(filePath, 'utf-8');
        return { canceled: false, filePath, content };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to open file';
        return { canceled: false, error: message };
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.NOTEPAD_READ_FILE,
      async (_, filePath: string) => {
        if (typeof filePath !== 'string' || !filePath) {
          return { canceled: false, error: 'Invalid path' };
        }
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size > MAX_READ_BYTES) {
            return {
              canceled: false,
              error: `File too large (${Math.round(
                fileStat.size / (1024 * 1024)
              )} MB).`,
            };
          }
          const content = await readFile(filePath, 'utf-8');
          return { canceled: false, content, filePath };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Failed to read file';
          return { canceled: false, error: message };
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.NOTEPAD_OPEN_PATH,
      async (_, filePath: string) => {
        if (typeof filePath !== 'string' || !filePath) {
          return { error: 'Invalid path' };
        }
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size > MAX_READ_BYTES) {
            return {
              error: `File too large (${Math.round(
                fileStat.size / (1024 * 1024)
              )} MB).`,
            };
          }
          const content = await readFile(filePath, 'utf-8');
          return { content, filePath };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Failed to open file';
          return { error: message };
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_REVEAL, async (_, filePath: string) => {
      if (!filePath || typeof filePath !== 'string') return false;
      try {
        shell.showItemInFolder(filePath);
        return true;
      } catch {
        return false;
      }
    });

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_COPY_PATH, (_, filePath: string) => {
      if (!filePath || typeof filePath !== 'string') return false;
      clipboard.writeText(filePath);
      return true;
    });

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_GET_PENDING_FILES, () => {
      const drained = pendingFiles.splice(0, pendingFiles.length);
      return drained;
    });

    ipcMain.on(
      IPC_CHANNELS.NOTEPAD_QUIT_DECISION,
      (_, requestId: string, canQuit: boolean) => {
        const resolver = quitDecisionResolvers.get(requestId);
        if (resolver) resolver(Boolean(canQuit));
      }
    );

    // After app is ready and a renderer attaches, flush queued open-file paths.
    app.on('browser-window-focus', () => {
      if (pendingFiles.length === 0) return;
      const win = windowManager.getMainWindow();
      if (!win) return;
      const files = pendingFiles.splice(0, pendingFiles.length);
      for (const f of files) {
        win.webContents.send(IPC_CHANNELS.NOTEPAD_FILE_OPENED, f);
      }
    });
  },
};

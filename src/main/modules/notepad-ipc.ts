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
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/ipc';
import { prepareSwaggerPreview } from './notepad-swagger-preview';
import { readTextFile } from './notepad-file-read';
import { windowManager } from './window-manager';
import { storeManager } from './store-manager';
import { approvedPaths, FILE_ACCESS_DENIED_MESSAGE } from './approved-paths';

/** Hard cap on a single file payload (50 MB). */
const MAX_CONTENT_BYTES = 50 * 1024 * 1024;

// "All Files" is first so every extension stays selectable by default — the
// grouped filters below are just shortcuts for narrowing the list.
const FILE_FILTERS = [
  { name: 'All Files', extensions: ['*'] },
  {
    name: 'Text & Code',
    extensions: [
      'txt',
      'text',
      'log',
      'md',
      'markdown',
      'mdx',
      'rst',
      'csv',
      'tsv',
      'diff',
      'patch',
      'js',
      'mjs',
      'cjs',
      'jsx',
      'ts',
      'tsx',
      'mts',
      'cts',
      'py',
      'rb',
      'go',
      'rs',
      'java',
      'kt',
      'kts',
      'swift',
      'c',
      'h',
      'cpp',
      'hpp',
      'cs',
      'php',
      'dart',
      'scala',
      'lua',
      'pl',
      'r',
      'sh',
      'bash',
      'zsh',
      'ps1',
      'bat',
      'cmd',
      'sql',
      'graphql',
      'gql',
      'proto',
    ],
  },
  {
    name: 'Data & Config',
    extensions: [
      'json',
      'jsonc',
      'json5',
      'jsonl',
      'ndjson',
      'geojson',
      'har',
      'webmanifest',
      'ipynb',
      'yaml',
      'yml',
      'toml',
      'ini',
      'cfg',
      'conf',
      'properties',
      'env',
      'editorconfig',
      'tf',
      'tfvars',
      'hcl',
      'dockerfile',
    ],
  },
  {
    name: 'Markup & Web',
    extensions: [
      'html',
      'htm',
      'xhtml',
      'vue',
      'svelte',
      'astro',
      'css',
      'scss',
      'sass',
      'less',
      'xml',
      'xsd',
      'xsl',
      'xslt',
      'wsdl',
      'svg',
      'rss',
      'atom',
      'plist',
      'hbs',
      'pug',
    ],
  },
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
    // The OS handed us this path (file association / "Open With"), which is
    // an explicit user action, so the renderer may read it back.
    approvedPaths.approveFile(filePath);
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

  /**
   * Re-approve files that open notepad tabs already point at. Those paths were
   * chosen through a dialog in an earlier session, and without this a restored
   * tab could no longer be saved. Read from disk at boot, before the renderer
   * can influence state.
   */
  approvePersistedTabPaths(): void {
    try {
      const tabs = storeManager.getState()?.notepad?.tabs;
      if (!Array.isArray(tabs)) return;
      tabs.forEach((tab) => {
        if (tab?.filePath) approvedPaths.approveFile(tab.filePath);
      });
    } catch (error) {
      console.warn(
        'Could not re-approve persisted notepad paths:',
        error instanceof Error ? error.message : error
      );
    }
  },

  initialize(): void {
    this.approvePersistedTabPaths();

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
          if (targetPath) {
            if (!approvedPaths.hasFile(targetPath)) {
              return err('ACCESS_DENIED', FILE_ACCESS_DENIED_MESSAGE);
            }
          } else {
            const result = await dialog.showSaveDialog({
              defaultPath: safeDefaultName(defaultName),
              filters: FILE_FILTERS,
            });
            if (result.canceled || !result.filePath) {
              return { ok: false, canceled: true } as const;
            }
            targetPath = result.filePath;
            // Approve so later Cmd+S saves to the same file don't re-prompt.
            approvedPaths.approveFile(targetPath);
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
        approvedPaths.approveFile(filePath);
        const read = await readTextFile(filePath);
        if (read.error) return { canceled: false, error: read.error };
        return { canceled: false, filePath, content: read.content };
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
        if (!approvedPaths.hasFile(filePath)) {
          return { canceled: false, error: FILE_ACCESS_DENIED_MESSAGE };
        }
        try {
          const read = await readTextFile(filePath);
          if (read.error) return { canceled: false, error: read.error };
          return { canceled: false, content: read.content, filePath };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Failed to read file';
          return { canceled: false, error: message };
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.NOTEPAD_PREPARE_SWAGGER_PREVIEW,
      async (_, content: string) => {
        if (typeof content !== 'string') {
          return err('INVALID_ARGS', 'Preview content must be a string');
        }
        if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
          return err(
            'TOO_LARGE',
            `File exceeds ${Math.round(MAX_CONTENT_BYTES / (1024 * 1024))} MB limit`
          );
        }

        try {
          const preview = await prepareSwaggerPreview(content);
          return { ok: true, canceled: false, ...preview } as const;
        } catch (e) {
          const message =
            e instanceof Error
              ? e.message
              : 'Failed to prepare Swagger preview';
          return err('PREVIEW_FAILED', message);
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.NOTEPAD_OPEN_PATH,
      async (_, filePath: string) => {
        if (typeof filePath !== 'string' || !filePath) {
          return { error: 'Invalid path' };
        }
        if (!approvedPaths.hasFile(filePath)) {
          return { error: FILE_ACCESS_DENIED_MESSAGE };
        }
        try {
          const read = await readTextFile(filePath);
          if (read.error) return { error: read.error };
          return { content: read.content, filePath };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Failed to open file';
          return { error: message };
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.NOTEPAD_REVEAL, async (_, filePath: string) => {
      if (!filePath || typeof filePath !== 'string') return false;
      if (!approvedPaths.hasFile(filePath)) return false;
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

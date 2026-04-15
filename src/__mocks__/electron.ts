import { vi } from 'vitest';

export const app = {
  getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
  on: vi.fn(),
  whenReady: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn(),
  getName: vi.fn().mockReturnValue('restbro'),
  getVersion: vi.fn().mockReturnValue('1.0.0'),
  isPackaged: false,
};

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
};

export const BrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn().mockResolvedValue(undefined),
  loadFile: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  once: vi.fn(),
  webContents: {
    send: vi.fn(),
    on: vi.fn(),
    openDevTools: vi.fn(),
    session: { webRequest: { onHeadersReceived: vi.fn() } },
    printToPDF: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  },
  close: vi.fn(),
  destroy: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
  show: vi.fn(),
  hide: vi.fn(),
  setTitle: vi.fn(),
  getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
}));
(BrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([]);

export const dialog = {
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/test.json' }),
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/test.json'] }),
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
};

export const shell = {
  openExternal: vi.fn().mockResolvedValue(undefined),
  showItemInFolder: vi.fn(),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
};

export const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
  removeListener: vi.fn(),
};

export const net = {
  request: vi.fn(),
  fetch: vi.fn(),
};

export const autoUpdater = {
  on: vi.fn(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  setFeedURL: vi.fn(),
};

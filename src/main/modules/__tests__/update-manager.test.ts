import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', async () => import('../../../__mocks__/electron'));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
}));

import { updateManager } from '../update-manager';
import { autoUpdater } from 'electron-updater';
import { writeFileSync } from 'fs';

describe('update-manager.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('installAndRestart', () => {
    it('calls autoUpdater.quitAndInstall', () => {
      updateManager.installAndRestart();
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  describe('isUpdateReady', () => {
    it('returns false by default', () => {
      expect(updateManager.isUpdateReady()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('can be called without error', () => {
      expect(() => updateManager.destroy()).not.toThrow();
    });
  });

  describe('installOnQuitIfReady', () => {
    it('does not call quitAndInstall when no update is ready', () => {
      updateManager.installOnQuitIfReady();
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });
  });

  describe('notifyIfJustUpdated', () => {
    it('writes current version to file', () => {
      updateManager.notifyIfJustUpdated();
      expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
    });
  });
});

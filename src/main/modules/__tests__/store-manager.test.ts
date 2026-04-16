import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock electron before import
vi.mock('electron', async () => import('../../../__mocks__/electron'));

// Mock fs (sync functions used by store-manager)
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { existsSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { storeManager } from '../store-manager';

describe('store-manager.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('loads and parses existing valid JSON', async () => {
      const existingState = {
        collections: [{ id: 'c1', name: 'Test' }],
        openTabs: [],
        history: [],
        environments: [],
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.collections).toEqual([{ id: 'c1', name: 'Test' }]);
    });

    it('uses default state when database file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.collections).toEqual([]);
      expect(state.openTabs).toEqual([]);
      expect(state.history).toEqual([]);
      expect(state.environments).toEqual([]);
    });

    it('handles corrupted JSON file gracefully (falls back to defaultState)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('not valid json {{{');
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.collections).toEqual([]);
    });

    it('merges loaded data into defaultState (missing keys get defaults)', async () => {
      const partialState = {
        collections: [{ id: 'c1', name: 'Col' }],
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(partialState));
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.collections).toEqual([{ id: 'c1', name: 'Col' }]);
      expect(state.environments).toEqual([]);
      expect(state.history).toEqual([]);
      expect(state.globals).toEqual({ variables: {} });
      expect(state.hasCompletedThemeOnboarding).toBe(false);
    });

    it('writes to file after initialization to persist migrations', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('returns current in-memory state', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state).toBeDefined();
      expect(state.collections).toEqual([]);
    });
  });

  describe('setState', () => {
    it('merges updates into state (partial update)', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      storeManager.setState({
        environments: [{ id: 'e1', name: 'Staging', variables: {} }],
      });

      const state = storeManager.getState();
      expect(state.environments).toEqual([
        { id: 'e1', name: 'Staging', variables: {} },
      ]);
    });

    it('sanitizes tab responses: clamps large body to 5MB', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const largeBody = 'x'.repeat(6_000_000);
      storeManager.setState({
        openTabs: [
          {
            id: 'tab1',
            name: 'Test',
            request: {
              id: 'r1',
              name: 'R1',
              method: 'GET',
              url: '/',
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              headers: {},
              body: largeBody,
              time: 100,
              size: 6000000,
              timestamp: Date.now(),
            },
            isModified: false,
          },
        ],
      });

      const state = storeManager.getState();
      expect(state.openTabs[0].response!.body.length).toBe(5_000_000);
    });

    it('sanitizes history responses: strips body to empty string', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      storeManager.setState({
        history: [
          {
            id: 'h1',
            request: {
              id: 'r1',
              name: 'R1',
              method: 'GET',
              url: '/',
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              headers: {},
              body: 'some response body',
              time: 50,
              size: 100,
              timestamp: Date.now(),
            },
            timestamp: new Date(),
          },
        ],
      });

      const state = storeManager.getState();
      expect(state.history[0].response.body).toBe('');
    });
  });

  describe('flush', () => {
    it('writes immediately without waiting for debounce', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      vi.mocked(writeFile).mockClear();

      storeManager.setState({ environments: [] });
      await storeManager.flush();

      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('migrations / backward-compat', () => {
    it('file missing environments key gets default empty array', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ collections: [] })
      );
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      expect(storeManager.getState().environments).toEqual([]);
    });

    it('file missing globals key gets default globals', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ collections: [] })
      );
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      expect(storeManager.getState().globals).toEqual({ variables: {} });
    });

    it('file missing mockServers key gets default mockServers state', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ collections: [] })
      );
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      expect(storeManager.getState().mockServers).toEqual({ servers: [] });
    });

    it('existing data is preserved after merge', async () => {
      const existing = {
        collections: [{ id: 'c1', name: 'Col' }],
        environments: [{ id: 'e1', name: 'Prod', variables: { base: 'url' } }],
        globals: { variables: { key: 'val' } },
        hasCompletedThemeOnboarding: true,
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.collections).toEqual([{ id: 'c1', name: 'Col' }]);
      expect(state.environments).toEqual([
        { id: 'e1', name: 'Prod', variables: { base: 'url' } },
      ]);
      expect(state.globals).toEqual({ variables: { key: 'val' } });
      expect(state.hasCompletedThemeOnboarding).toBe(true);
    });

    it('replaces legacy navOrder with default', async () => {
      const legacyNavOrder = [
        'api',
        'json-viewer',
        'json-compare',
        'notepad',
        'load-testing',
        'mock-server',
        'ask-ai',
      ];
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ navOrder: legacyNavOrder })
      );
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      const state = storeManager.getState();
      expect(state.navOrder[0]).toBe('notepad');
    });
  });

  describe('backup operations', () => {
    it('listBackups returns empty array when backup dir does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await storeManager.initialize();

      // Override existsSync for backup dir check
      vi.mocked(existsSync).mockReturnValue(false);
      const backups = storeManager.listBackups();
      expect(backups).toEqual([]);
    });

    it('listBackups returns sorted backups (newest first)', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      await storeManager.initialize();

      // Now set up for listBackups call
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'database-backup-20240101-120000.json' as any,
        'database-backup-20240103-120000.json' as any,
        'database-backup-20240102-120000.json' as any,
      ]);

      const backups = storeManager.listBackups();
      expect(backups.length).toBe(3);
      expect(backups[0].filename).toBe('database-backup-20240103-120000.json');
      expect(backups[1].filename).toBe('database-backup-20240102-120000.json');
      expect(backups[2].filename).toBe('database-backup-20240101-120000.json');
    });

    it('listBackups respects the limit parameter', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      await storeManager.initialize();

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        'database-backup-20240101-120000.json' as any,
        'database-backup-20240102-120000.json' as any,
        'database-backup-20240103-120000.json' as any,
      ]);

      const backups = storeManager.listBackups(2);
      expect(backups.length).toBe(2);
    });

    it('restoreBackup throws when backup file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      await storeManager.initialize();

      vi.mocked(existsSync).mockReturnValue(false);

      await expect(
        storeManager.restoreBackup('some-backup.json')
      ).rejects.toThrow('Backup file not found');
    });
  });
});

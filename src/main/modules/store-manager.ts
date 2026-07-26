import { app } from 'electron';
import { join } from 'path';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'fs';
import { randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import {
  AppState,
  AppTheme,
  Collection,
  Globals,
  CollectionsUIState,
  JsonViewerUIState,
  JsonCompareUIState,
  NotepadState,
  MockServersState,
  RequestSettings,
  RequestTab,
  ApiResponse,
} from '../../shared/types';
import { sanitizeHistoryForPersistence } from '../../shared/history-persistence';

const defaultNavOrder = [
  'notepad',
  'api',
  'json-compare',
  'load-testing',
  'mock-server',
  'ask-ai',
];
const legacyNavOrder = [
  'api',
  'json-compare',
  'notepad',
  'load-testing',
  'mock-server',
  'ask-ai',
];

const defaultTheme: AppTheme = {
  name: 'blue',
  primaryColor: '#2563eb',
  accentColor: '#1d4ed8',
};

const defaultGlobals: Globals = {
  variables: {},
};

const defaultCollectionsUIState: CollectionsUIState = {
  expandedFolderIds: [],
};

const defaultJsonViewerUIState: JsonViewerUIState = {
  expandedNodesByRequest: {},
  requestAccessOrder: [],
};

const defaultJsonCompareUIState: JsonCompareUIState = {
  leftJson: '',
  rightJson: '',
  tableFilter: '',
  valueFilter: '',
  selectedTypes: ['added', 'removed', 'changed'],
  leftLabel: 'Left',
  rightLabel: 'Right',
  options: {
    sortKeys: false,
    ignoreArrayOrder: true,
    caseInsensitive: false,
    ignoreStringWhitespace: false,
    ignorePaths: [],
  },
};

/** Per-side JSON cap for json-compare persistence (~256 KB). */
const JSON_COMPARE_MAX_SIDE_CHARS = 256 * 1024;

const defaultNotepadState: NotepadState = {
  tabs: [],
  activeTabId: undefined,
  untitledCounter: 1,
};

const defaultMockServersState: MockServersState = {
  servers: [],
};

const defaultRequestSettings: RequestSettings = {
  defaultTimeoutMs: 60000,
  followRedirects: true,
  maxRedirects: 10,
  maxResponseSizeBytes: 50 * 1024 * 1024, // 50 MB
};

const defaultState: AppState = {
  collections: [],
  openTabs: [],
  history: [],
  theme: defaultTheme,
  navOrder: defaultNavOrder,
  environments: [],
  globals: defaultGlobals,
  collectionsUIState: defaultCollectionsUIState,
  jsonViewerUIState: defaultJsonViewerUIState,
  jsonCompareUIState: defaultJsonCompareUIState,
  notepad: defaultNotepadState,
  mockServers: defaultMockServersState,
  hasCompletedThemeOnboarding: false,
  requestSettings: defaultRequestSettings,
  loadTestHistory: [],
  speedTestHistory: [],
};

// Backup retention — keep only the 5 most recent snapshots on disk.
// Auto-backups fire every 24h via `startAutoBackup`; older snapshots
// are pruned automatically after each new backup.
const MAX_BACKUPS = 5;

// After a restore, ignore renderer-driven setState writes for this long
// so any in-flight autosave (the renderer pushes its in-memory snapshot
// every 30s) cannot overwrite the just-restored data before the renderer
// has had a chance to reload from disk.
const RESTORE_LOCK_MS = 5_000;

class StoreManager {
  private dbPath: string;
  private data: AppState;
  private writeQueue: NodeJS.Timeout | null = null;
  private backupTimer: NodeJS.Timeout | null = null;
  private restoreLockUntil = 0;

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'database.json');
    this.data = defaultState;
  }

  async initialize(): Promise<void> {
    if (existsSync(this.dbPath)) {
      try {
        const fileContent = await readFile(this.dbPath, 'utf-8');
        const loadedData = JSON.parse(fileContent);

        this.data = this.mergeLoadedData(loadedData);
      } catch (error) {
        console.error(
          'Failed to read database file, using default state:',
          error
        );
        this.data = defaultState;
      }
    } else {
      this.data = defaultState;
    }

    // Seed default collections on first launch
    this.seedDefaultCollections();

    // Always write to ensure migrations are persisted
    await this.writeToFile();
  }

  getState(): AppState {
    return this.data;
  }

  setState(updates: Partial<AppState>): void {
    // While a Time Machine restore is settling (the renderer is about
    // to `window.location.reload()` after restoreBackup resolves), drop
    // any incoming writes. Otherwise the renderer's 30s autosave can
    // race the restore and re-publish the pre-restore in-memory state.
    if (Date.now() < this.restoreLockUntil) return;

    const sanitizedUpdates = this.sanitizeUpdatesForPersistence(updates);
    this.data = { ...this.data, ...sanitizedUpdates };
    this.queueWrite();
  }

  private queueWrite(): void {
    if (this.writeQueue) {
      clearTimeout(this.writeQueue);
    }
    this.writeQueue = setTimeout(async () => {
      await this.writeToFile();
      this.writeQueue = null;
    }, 500);
  }

  private async writeToFile(): Promise<void> {
    try {
      await writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write database file:', error);
    }
  }

  private sanitizeUpdatesForPersistence(
    updates: Partial<AppState>
  ): Partial<AppState> {
    const next: Partial<AppState> = { ...updates };

    if (updates.openTabs) {
      next.openTabs = updates.openTabs.map((tab: RequestTab) => ({
        ...tab,
        response: this.sanitizeTabResponse(tab.response),
      }));
    }

    if (updates.history) {
      next.history = sanitizeHistoryForPersistence(updates.history);
    }

    if (updates.jsonCompareUIState) {
      next.jsonCompareUIState = this.sanitizeJsonCompareState(
        updates.jsonCompareUIState
      );
    }

    return next;
  }

  private sanitizeJsonCompareState(
    state: JsonCompareUIState
  ): JsonCompareUIState {
    const left = state.leftJson || '';
    const right = state.rightJson || '';
    const leftTruncated = left.length > JSON_COMPARE_MAX_SIDE_CHARS;
    const rightTruncated = right.length > JSON_COMPARE_MAX_SIDE_CHARS;
    return {
      ...state,
      leftJson: leftTruncated
        ? left.slice(0, JSON_COMPARE_MAX_SIDE_CHARS)
        : left,
      rightJson: rightTruncated
        ? right.slice(0, JSON_COMPARE_MAX_SIDE_CHARS)
        : right,
      leftTruncated,
      rightTruncated,
    };
  }

  // For open tabs: preserve body up to 5 MB so large JSON remains valid after restart
  private sanitizeTabResponse(response?: ApiResponse): ApiResponse | undefined {
    if (!response) return undefined;

    const MAX_BODY_CHARS = 5_000_000; // ~5 MB
    return {
      ...response,
      body:
        response.body.length > MAX_BODY_CHARS
          ? response.body.slice(0, MAX_BODY_CHARS)
          : response.body,
    };
  }

  startAutoBackup(intervalMs = 24 * 60 * 60 * 1000): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }

    this.backupTimer = setInterval(() => {
      this.createBackup();
    }, intervalMs);

    const lastBackup = this.getLatestBackupTime();
    if (!lastBackup || Date.now() - lastBackup >= intervalMs) {
      this.createBackup();
    }
  }

  stopAutoBackup(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  listBackups(
    limit = 5
  ): Array<{ id: string; filename: string; createdAt: number }> {
    const backupDir = this.getBackupDir();
    if (!existsSync(backupDir)) {
      return [];
    }

    const backups = readdirSync(backupDir)
      .filter(
        (name) => name.startsWith('database-backup-') && name.endsWith('.json')
      )
      .map((name) => {
        const createdAt = this.parseBackupTimestamp(name);
        return { id: name, filename: name, createdAt: createdAt ?? 0 };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return backups.slice(0, limit);
  }

  async restoreBackup(backupId: string): Promise<void> {
    // Validate backup ID to prevent path traversal
    if (!backupId || /[\/\\]|\.\./.test(backupId)) {
      throw new Error('Invalid backup ID');
    }
    const backupDir = this.getBackupDir();
    const backupPath = join(backupDir, backupId);
    if (!existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    // Cancel any pending debounced write so a setState from moments
    // before the restore can't fire after and stomp on the restored data.
    if (this.writeQueue) {
      clearTimeout(this.writeQueue);
      this.writeQueue = null;
    }

    // Snapshot the current state so the user can also undo the restore
    // itself if they picked the wrong timestamp.
    this.createBackup();

    const fileContent = await readFile(backupPath, 'utf-8');
    const loadedData = JSON.parse(fileContent);
    this.data = this.mergeLoadedData(loadedData);

    // Engage the restore lock BEFORE writing so any setState that arrives
    // while the renderer is still mid-reload is dropped instead of
    // re-publishing the pre-restore in-memory state.
    this.restoreLockUntil = Date.now() + RESTORE_LOCK_MS;

    await this.writeToFile();
  }

  /** Returns lightweight stats for a backup file (collections / requests). */
  describeBackup(
    backupId: string
  ): { collections: number; requests: number; sizeBytes: number } | null {
    if (!backupId || /[\/\\]|\.\./.test(backupId)) return null;
    const backupPath = join(this.getBackupDir(), backupId);
    if (!existsSync(backupPath)) return null;
    try {
      const raw = readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppState>;
      const collections = Array.isArray(parsed.collections)
        ? parsed.collections
        : [];
      return {
        collections: collections.filter((c) => c.type === 'folder').length,
        requests: collections.filter((c) => c.type === 'request').length,
        sizeBytes: Buffer.byteLength(raw, 'utf-8'),
      };
    } catch {
      return null;
    }
  }

  private mergeLoadedData(loadedData: Partial<AppState>): AppState {
    const sanitizedLoaded = this.sanitizeUpdatesForPersistence(loadedData);

    return {
      ...defaultState,
      ...sanitizedLoaded,
      history: sanitizedLoaded.history || [],
      environments: sanitizedLoaded.environments || [],
      activeEnvironmentId: sanitizedLoaded.activeEnvironmentId,
      globals: sanitizedLoaded.globals || defaultGlobals,
      collectionsUIState:
        sanitizedLoaded.collectionsUIState || defaultCollectionsUIState,
      jsonViewerUIState:
        sanitizedLoaded.jsonViewerUIState || defaultJsonViewerUIState,
      jsonCompareUIState: {
        ...defaultJsonCompareUIState,
        ...(sanitizedLoaded.jsonCompareUIState || {}),
        options: {
          ...defaultJsonCompareUIState.options,
          ...(sanitizedLoaded.jsonCompareUIState?.options || {}),
        },
      },
      notepad: sanitizedLoaded.notepad || defaultNotepadState,
      navOrder: this.resolveNavOrder(sanitizedLoaded.navOrder),
      mockServers: sanitizedLoaded.mockServers || defaultMockServersState,
      hasCompletedThemeOnboarding:
        sanitizedLoaded.hasCompletedThemeOnboarding ?? false,
      requestSettings: {
        ...defaultRequestSettings,
        ...(sanitizedLoaded.requestSettings || {}),
      },
      hasSeededDefaults: sanitizedLoaded.hasSeededDefaults ?? false,
    };
  }

  private resolveNavOrder(
    navOrder?: AppState['navOrder']
  ): AppState['navOrder'] {
    if (!Array.isArray(navOrder) || navOrder.length === 0) {
      return defaultNavOrder;
    }

    // Drop tab ids for removed features (e.g. the standalone 'json-viewer'
    // tab, now folded into Notepad) so stale persisted orders stay valid.
    const normalized = navOrder
      .filter(Boolean)
      .filter((tab) => tab !== 'json-viewer');
    if (this.arraysMatch(normalized, legacyNavOrder)) {
      return defaultNavOrder;
    }

    return normalized;
  }

  private arraysMatch(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  /**
   * Public entry point for callers that want to capture the current state
   * (e.g. before a destructive bulk operation). Currently unused by the
   * automatic backup pipeline — auto-backups remain strictly 24h — but
   * exposed so future callers can request an on-demand snapshot.
   */
  createSnapshot(): void {
    this.createBackup();
  }

  private createBackup(): void {
    try {
      const backupDir = this.getBackupDir();
      mkdirSync(backupDir, { recursive: true });
      const filename = `database-backup-${this.formatTimestamp(new Date())}.json`;
      const backupPath = join(backupDir, filename);
      writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf-8');
      this.pruneBackups(MAX_BACKUPS);
    } catch (error) {
      console.error('Failed to create backup:', error);
    }
  }

  private pruneBackups(keepCount: number): void {
    const backups = this.listBackups(keepCount + 20);
    if (backups.length <= keepCount) {
      return;
    }

    const backupDir = this.getBackupDir();
    backups.slice(keepCount).forEach((backup) => {
      const backupPath = join(backupDir, backup.filename);
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
    });
  }

  private getLatestBackupTime(): number | null {
    const backups = this.listBackups(1);
    if (backups.length === 0) {
      return null;
    }
    return backups[0].createdAt || null;
  }

  private getBackupDir(): string {
    return join(app.getPath('userData'), 'backups');
  }

  private formatTimestamp(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return (
      [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
        ''
      ) +
      '-' +
      [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
      ].join('')
    );
  }

  private parseBackupTimestamp(filename: string): number | null {
    const match = filename.match(/database-backup-(\d{8})-(\d{6})\.json$/);
    if (!match) {
      return null;
    }
    const [datePart, timePart] = match.slice(1);
    const year = Number(datePart.slice(0, 4));
    const month = Number(datePart.slice(4, 6)) - 1;
    const day = Number(datePart.slice(6, 8));
    const hour = Number(timePart.slice(0, 2));
    const minute = Number(timePart.slice(2, 4));
    const second = Number(timePart.slice(4, 6));
    const parsed = new Date(year, month, day, hour, minute, second);
    return isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  private seedDefaultCollections(): void {
    if (this.data.hasSeededDefaults) return;
    if (this.data.collections.length > 0) {
      // Existing user with data — mark as seeded without adding defaults
      this.data.hasSeededDefaults = true;
      return;
    }

    const now = new Date();
    const folderId = randomUUID();

    const mocksFolder: Collection = {
      id: folderId,
      name: 'Mocks',
      type: 'folder',
      order: 0,
      createdAt: now,
      updatedAt: now,
    };

    const smallRequestId = randomUUID();
    const smallRequest: Collection = {
      id: smallRequestId,
      name: 'Small',
      type: 'request',
      parentId: folderId,
      order: 0,
      request: {
        id: randomUUID(),
        name: 'Small',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        params: {},
        headers: {},
      },
      createdAt: now,
      updatedAt: now,
    };

    const bigRequestId = randomUUID();
    const bigRequest: Collection = {
      id: bigRequestId,
      name: 'Big',
      type: 'request',
      parentId: folderId,
      order: 1000,
      request: {
        id: randomUUID(),
        name: 'Big',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/posts',
        params: {},
        headers: {},
      },
      createdAt: now,
      updatedAt: now,
    };

    this.data.collections = [mocksFolder, smallRequest, bigRequest];
    this.data.hasSeededDefaults = true;
  }

  async flush(): Promise<void> {
    if (this.writeQueue) {
      clearTimeout(this.writeQueue);
      this.writeQueue = null;
    }
    await this.writeToFile();
  }
}

export const storeManager = new StoreManager();

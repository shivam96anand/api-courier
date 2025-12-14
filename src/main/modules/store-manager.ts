import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { AppState, AppTheme, Globals, CollectionsUIState, NotepadState } from '../../shared/types';

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

const defaultNotepadState: NotepadState = {
  tabs: [],
  activeTabId: undefined,
  untitledCounter: 1,
};

const defaultState: AppState = {
  collections: [],
  openTabs: [],
  history: [],
  theme: defaultTheme,
  environments: [],
  globals: defaultGlobals,
  collectionsUIState: defaultCollectionsUIState,
  notepad: defaultNotepadState,
};

class StoreManager {
  private dbPath: string;
  private data: AppState;
  private writeQueue: NodeJS.Timeout | null = null;

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'database.json');
    this.data = defaultState;
  }

  async initialize(): Promise<void> {
    if (existsSync(this.dbPath)) {
      try {
        const fileContent = readFileSync(this.dbPath, 'utf-8');
        const loadedData = JSON.parse(fileContent);

        // Merge with default state to handle new fields (migration)
        this.data = {
          ...defaultState,
          ...loadedData,
          // Ensure history exists if not present
          history: loadedData.history || [],
          // Migration: Add environments and globals if not present
          environments: loadedData.environments || [],
          activeEnvironmentId: loadedData.activeEnvironmentId,
          globals: loadedData.globals || defaultGlobals,
          collectionsUIState: loadedData.collectionsUIState || defaultCollectionsUIState,
          notepad: loadedData.notepad || defaultNotepadState,
        };
      } catch (error) {
        console.error('Failed to read database file, using default state:', error);
        this.data = defaultState;
      }
    } else {
      this.data = defaultState;
    }

    // Always write to ensure migrations are persisted
    await this.writeToFile();
  }

  getState(): AppState {
    return this.data;
  }

  setState(updates: Partial<AppState>): void {
    this.data = { ...this.data, ...updates };
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
      writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write database file:', error);
    }
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

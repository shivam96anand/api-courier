import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface Collection {
  id: string;
  name: string;
  parentId?: string;
  type: 'folder' | 'request';
  requests?: APIRequest[];
}

export interface APIRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: Record<string, string>;
  body?: {
    type: 'json' | 'raw' | 'form-urlencoded' | 'form-data' | 'binary';
    content: string;
  };
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    config: Record<string, unknown>;
  };
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export interface AppData {
  collections: Collection[];
  environments: Environment[];
  activeEnvironment?: string;
  settings: {
    theme: 'dark' | 'light';
    followRedirects: boolean;
    requestTimeout: number;
  };
  history: APIRequest[];
}

/**
 * Manages application persistence using simple JSON file storage
 */
export class PersistenceManager {
  private data: AppData | null = null;
  private dataPath: string = '';
  private writeQueue: Set<() => void> = new Set();
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initialize the persistence layer
   */
  public async initialize(): Promise<void> {
    const userDataPath = app.getPath('userData');
    this.dataPath = path.join(userDataPath, 'api-courier-data.json');

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });

    try {
      // Try to read existing data
      const fileContent = await fs.readFile(this.dataPath, 'utf-8');
      this.data = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist or is invalid, create default data
      this.data = this.getDefaultData();
      await this.writeDataToFile();
    }
  }

  /**
   * Get default application data structure
   */
  private getDefaultData(): AppData {
    return {
      collections: [
        {
          id: 'default-collection',
          name: 'My Collection',
          type: 'folder',
          requests: [],
        },
      ],
      environments: [
        {
          id: 'default-env',
          name: 'Development',
          variables: {
            baseUrl: 'http://localhost:3000',
            apiKey: '',
          },
        },
      ],
      activeEnvironment: 'default-env',
      settings: {
        theme: 'dark',
        followRedirects: true,
        requestTimeout: 30000,
      },
      history: [],
    };
  }

  /**
   * Write data to file
   */
  private async writeDataToFile(): Promise<void> {
    if (!this.data) return;
    
    try {
      await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write data to file:', error);
    }
  }

  /**
   * Queue a write operation with debouncing
   */
  private queueWrite(operation: () => void): void {
    this.writeQueue.add(operation);
    
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, 500); // Debounce writes by 500ms
  }

  /**
   * Flush all pending write operations
   */
  public async flush(): Promise<void> {
    if (this.writeQueue.size === 0) return;

    const operations = Array.from(this.writeQueue);
    this.writeQueue.clear();

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    // Execute all queued operations
    for (const operation of operations) {
      operation();
    }

    // Write to disk
    await this.writeDataToFile();
  }

  /**
   * Get all collections
   */
  public getCollections(): Collection[] {
    return this.data?.collections || [];
  }

  /**
   * Add or update a collection
   */
  public saveCollection(collection: Collection): void {
    this.queueWrite(() => {
      if (!this.data) return;

      const index = this.data.collections.findIndex(c => c.id === collection.id);
      if (index >= 0) {
        this.data.collections[index] = collection;
      } else {
        this.data.collections.push(collection);
      }
    });
  }

  /**
   * Delete a collection
   */
  public deleteCollection(id: string): void {
    this.queueWrite(() => {
      if (!this.data) return;
      this.data.collections = this.data.collections.filter(c => c.id !== id);
    });
  }

  /**
   * Get all environments
   */
  public getEnvironments(): Environment[] {
    return this.data?.environments || [];
  }

  /**
   * Get active environment
   */
  public getActiveEnvironment(): Environment | null {
    const activeId = this.data?.activeEnvironment;
    return this.getEnvironments().find(env => env.id === activeId) || null;
  }

  /**
   * Set active environment
   */
  public setActiveEnvironment(id: string): void {
    this.queueWrite(() => {
      if (!this.data) return;
      this.data.activeEnvironment = id;
    });
  }

  /**
   * Save environment
   */
  public saveEnvironment(environment: Environment): void {
    this.queueWrite(() => {
      if (!this.data) return;

      const index = this.data.environments.findIndex(e => e.id === environment.id);
      if (index >= 0) {
        this.data.environments[index] = environment;
      } else {
        this.data.environments.push(environment);
      }
    });
  }

  /**
   * Get application settings
   */
  public getSettings(): AppData['settings'] {
    return this.data?.settings || {
      theme: 'dark',
      followRedirects: true,
      requestTimeout: 30000,
    };
  }

  /**
   * Update application settings
   */
  public updateSettings(settings: Partial<AppData['settings']>): void {
    this.queueWrite(() => {
      if (!this.data) return;
      this.data.settings = { ...this.data.settings, ...settings };
    });
  }

  /**
   * Add request to history
   */
  public addToHistory(request: APIRequest): void {
    this.queueWrite(() => {
      if (!this.data) return;
      
      // Remove existing entry if it exists
      this.data.history = this.data.history.filter(h => h.id !== request.id);
      
      // Add to beginning
      this.data.history.unshift(request);
      
      // Limit history to 100 entries
      if (this.data.history.length > 100) {
        this.data.history = this.data.history.slice(0, 100);
      }
    });
  }

  /**
   * Get request history
   */
  public getHistory(): APIRequest[] {
    return this.data?.history || [];
  }
}

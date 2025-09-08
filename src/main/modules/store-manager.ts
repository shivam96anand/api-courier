import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { app } from 'electron';
import { Collection, AppSettings, Request } from '../../shared/types';

interface Database {
  collections: Collection[];
  requests: Request[];
  settings: AppSettings;
}

export class StoreManager {
  private db: Low<Database>;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'api-courier-data.json');
    
    const adapter = new JSONFile<Database>(this.dbPath);
    this.db = new Low<Database>(adapter, {
      collections: [],
      requests: [],
      settings: {
        theme: 'dark',
        fontSize: 14,
        sidebarWidth: 300,
        requestPanelWidth: 400
      }
    });
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.db.read();
    
    // Ensure all arrays exist
    if (!this.db.data) {
      this.db.data = {
        collections: [],
        requests: [],
        settings: {
          theme: 'dark',
          fontSize: 14,
          sidebarWidth: 300,
          requestPanelWidth: 400
        }
      };
    } else {
      if (!this.db.data.collections) this.db.data.collections = [];
      if (!this.db.data.requests) this.db.data.requests = [];
      if (!this.db.data.settings) {
        this.db.data.settings = {
          theme: 'dark',
          fontSize: 14,
          sidebarWidth: 300,
          requestPanelWidth: 400
        };
      }
    }
    
    await this.db.write();
  }

  getCollections(): Collection[] {
    return this.db.data?.collections || [];
  }

  async saveCollection(collection: Collection): Promise<void> {
    if (!this.db.data) return;

    const existingIndex = this.db.data.collections.findIndex(c => c.id === collection.id);
    
    if (existingIndex >= 0) {
      this.db.data.collections[existingIndex] = collection;
    } else {
      this.db.data.collections.push(collection);
    }

    await this.db.write();
  }

  async deleteCollection(id: string): Promise<void> {
    if (!this.db.data) return;

    // Remove the collection
    this.db.data.collections = this.db.data.collections.filter(c => c.id !== id);
    
    // Also remove any requests that belong to this collection
    this.db.data.requests = this.db.data.requests.filter(r => r.collectionId !== id);
    
    await this.db.write();
  }

  getRequests(): Request[] {
    return this.db.data?.requests || [];
  }

  async saveRequest(request: Request): Promise<void> {
    if (!this.db.data) return;

    const existingIndex = this.db.data.requests.findIndex(r => r.id === request.id);
    
    if (existingIndex >= 0) {
      this.db.data.requests[existingIndex] = request;
    } else {
      this.db.data.requests.push(request);
    }

    await this.db.write();
  }

  async deleteRequest(id: string): Promise<void> {
    if (!this.db.data) return;
    if (!this.db.data.requests) this.db.data.requests = [];

    this.db.data.requests = this.db.data.requests.filter(r => r.id !== id);
    await this.db.write();
  }

  getSettings(): AppSettings {
    return this.db.data?.settings || {
      theme: 'dark',
      fontSize: 14,
      sidebarWidth: 300,
      requestPanelWidth: 400
    };
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    if (!this.db.data) return;

    this.db.data.settings = { ...this.db.data.settings, ...settings };
    await this.db.write();
  }

  async flush(): Promise<void> {
    await this.db.write();
  }
}

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { app } from 'electron';
import { Collection, AppSettings, Request, Response } from '../../shared/types';

interface StoredResponse {
  requestId: string;
  response: Response;
  timestamp: number;
}

interface Database {
  collections: Collection[];
  requests: Request[];
  responses: StoredResponse[];
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
      responses: [],
      settings: {
        theme: 'dark',
        fontSize: 14,
        sidebarWidth: 300,
        requestPanelWidth: 400,
        expandedFolders: []
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
        responses: [],
        settings: {
          theme: 'dark',
          fontSize: 14,
          sidebarWidth: 300,
          requestPanelWidth: 400,
          expandedFolders: []
        }
      };
    } else {
      if (!this.db.data.collections) this.db.data.collections = [];
      if (!this.db.data.requests) this.db.data.requests = [];
      if (!this.db.data.responses) this.db.data.responses = [];
      if (!this.db.data.settings) {
        this.db.data.settings = {
          theme: 'dark',
          fontSize: 14,
          sidebarWidth: 300,
          requestPanelWidth: 400,
          expandedFolders: []
        };
      } else if (!this.db.data.settings.expandedFolders) {
        // Ensure expandedFolders exists in existing settings
        this.db.data.settings.expandedFolders = [];
      }
    }
    
    // Clean up any child collections that might be in the root array
    this.cleanupChildCollections();
    
    await this.db.write();
  }

  getCollections(): Collection[] {
    const collections = this.db.data?.collections || [];
    const requests = this.db.data?.requests || [];
    
    // Merge requests into their parent collections
    const mergeRequests = (collections: Collection[]): Collection[] => {
      return collections.map(collection => {
        // Find requests for this collection
        const collectionRequests = requests.filter(r => r.collectionId === collection.id);
        
        // Process child collections recursively
        const processedChildren = collection.children ? mergeRequests(collection.children) : [];
        
        return {
          ...collection,
          requests: collectionRequests,
          children: processedChildren
        };
      });
    };
    
    return mergeRequests(collections);
  }

  async saveCollection(collection: Collection): Promise<void> {
    if (!this.db.data) return;

    // Extract requests from the collection and its children
    const extractRequests = (col: Collection): Request[] => {
      let requests: Request[] = [];
      
      // Add requests from this collection
      if (col.requests) {
        requests.push(...col.requests.map(r => ({ ...r, collectionId: col.id })));
      }
      
      // Add requests from child collections recursively
      if (col.children) {
        col.children.forEach(child => {
          requests.push(...extractRequests(child));
        });
      }
      
      return requests;
    };

    // Extract all requests from this collection tree
    const collectionRequests = extractRequests(collection);
    
    // Save requests separately
    collectionRequests.forEach(request => {
      const existingIndex = this.db.data!.requests.findIndex(r => r.id === request.id);
      if (existingIndex >= 0) {
        this.db.data!.requests[existingIndex] = request;
      } else {
        this.db.data!.requests.push(request);
      }
    });

    // Save collection without embedded requests (clean structure)
    const cleanCollection = (col: Collection): Collection => ({
      ...col,
      requests: [], // Don't store requests in collection structure
      children: col.children ? col.children.map(cleanCollection) : []
    });

    const existingIndex = this.db.data.collections.findIndex(c => c.id === collection.id);
    const cleanCol = cleanCollection(collection);
    
    // Only save as root collection if it doesn't have a parentId
    if (!collection.parentId) {
      if (existingIndex >= 0) {
        this.db.data.collections[existingIndex] = cleanCol;
      } else {
        this.db.data.collections.push(cleanCol);
      }
    } else {
      // If it has a parentId, it should only exist within its parent's children
      // The parent collection should be saved instead
      console.warn('Attempting to save child collection directly. Parent collection should be saved instead.');
      return;
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
      requestPanelWidth: 400,
      expandedFolders: []
    };
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    if (!this.db.data) return;

    this.db.data.settings = { ...this.db.data.settings, ...settings };
    await this.db.write();
  }

  async saveResponse(requestId: string, response: Response): Promise<void> {
    if (!this.db.data) return;
    if (!this.db.data.responses) this.db.data.responses = [];

    // Remove any existing response for this request
    this.db.data.responses = this.db.data.responses.filter(r => r.requestId !== requestId);
    
    // Add the new response
    this.db.data.responses.push({
      requestId,
      response,
      timestamp: Date.now()
    });

    // Keep only the latest 100 responses to prevent database bloat
    if (this.db.data.responses.length > 100) {
      this.db.data.responses = this.db.data.responses
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);
    }

    await this.db.write();
  }

  getResponse(requestId: string): Response | null {
    if (!this.db.data?.responses) return null;
    
    const stored = this.db.data.responses.find(r => r.requestId === requestId);
    return stored ? stored.response : null;
  }

  async deleteResponse(requestId: string): Promise<void> {
    if (!this.db.data?.responses) return;
    
    this.db.data.responses = this.db.data.responses.filter(r => r.requestId !== requestId);
    await this.db.write();
  }

  async flush(): Promise<void> {
    await this.db.write();
  }

  private cleanupChildCollections(): void {
    if (!this.db.data?.collections) return;

    // Remove any collections that have a parentId from the root array
    // They should only exist within their parent's children array
    const rootCollections = this.db.data.collections.filter(c => !c.parentId);
    
    if (rootCollections.length !== this.db.data.collections.length) {
      console.log(`Cleaned up ${this.db.data.collections.length - rootCollections.length} misplaced child collections`);
      this.db.data.collections = rootCollections;
    }
  }
}

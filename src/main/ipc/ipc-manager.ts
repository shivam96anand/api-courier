import { ipcMain, dialog } from 'electron';
import { PersistenceManager, Collection, Environment, APIRequest } from '../persistence/persistence-manager';
import { NetworkManager, RequestOptions } from '../networking/network-manager';
import { OAuthManager } from '../oauth/oauth-manager';
import { OAuth2Config } from '../../shared/types';
import { writeFileSync, readFileSync } from 'fs';
import { PostmanImporter } from '../importers/postman-importer';
import { ThemeManager } from '../themes/theme-manager';

/**
 * Manages IPC communication between main and renderer processes
 */
export class IPCManager {
  private oauthManager: OAuthManager;
  private postmanImporter: PostmanImporter;
  private themeManager: ThemeManager;

  constructor(
    private persistenceManager: PersistenceManager,
    private networkManager: NetworkManager
  ) {
    this.oauthManager = new OAuthManager();
    this.postmanImporter = new PostmanImporter();
    this.themeManager = new ThemeManager();
  }

  /**
   * Setup all IPC handlers
   */
  public setupHandlers(): void {
    this.setupStoreHandlers();
    this.setupNetworkHandlers();
    this.setupOAuthHandlers();
    this.setupFileHandlers();
    this.setupThemeHandlers();
    this.setupImportHandlers();
  }

  /**
   * Setup persistence-related IPC handlers
   */
  private setupStoreHandlers(): void {
    // Collections
    ipcMain.handle('store:getCollections', () => {
      return this.persistenceManager.getCollections();
    });

    ipcMain.handle('store:saveCollection', (_event, collection: Collection) => {
      this.persistenceManager.saveCollection(collection);
      return { success: true };
    });

    ipcMain.handle('store:deleteCollection', (_event, id: string) => {
      this.persistenceManager.deleteCollection(id);
      return { success: true };
    });

    // Environments
    ipcMain.handle('store:getEnvironments', () => {
      return this.persistenceManager.getEnvironments();
    });

    ipcMain.handle('store:getActiveEnvironment', () => {
      return this.persistenceManager.getActiveEnvironment();
    });

    ipcMain.handle('store:setActiveEnvironment', (_event, id: string) => {
      this.persistenceManager.setActiveEnvironment(id);
      return { success: true };
    });

    ipcMain.handle('store:saveEnvironment', (_event, environment: Environment) => {
      this.persistenceManager.saveEnvironment(environment);
      return { success: true };
    });

    // Settings
    ipcMain.handle('store:getSettings', () => {
      return this.persistenceManager.getSettings();
    });

    ipcMain.handle('store:updateSettings', (_event, settings: Record<string, unknown>) => {
      this.persistenceManager.updateSettings(settings);
      return { success: true };
    });

    // History
    ipcMain.handle('store:getHistory', () => {
      return this.persistenceManager.getHistory();
    });

    ipcMain.handle('store:addToHistory', (_event, request: APIRequest) => {
      this.persistenceManager.addToHistory(request);
      return { success: true };
    });
  }

  /**
   * Setup network-related IPC handlers
   */
  private setupNetworkHandlers(): void {
    ipcMain.handle('network:executeRequest', async (_event, requestId: string, options: RequestOptions) => {
      try {
        const response = await this.networkManager.executeRequest(requestId, options);
        return { success: true, data: response };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error occurred' 
        };
      }
    });

    ipcMain.handle('network:cancelRequest', (_event, requestId: string) => {
      const cancelled = this.networkManager.cancelRequest(requestId);
      return { success: cancelled };
    });

    ipcMain.handle('network:getActiveRequests', () => {
      return this.networkManager.getActiveRequestIds();
    });

    ipcMain.handle('network:validateUrl', (_event, url: string) => {
      return this.networkManager.validateUrl(url);
    });
  }

  /**
   * Setup OAuth-related IPC handlers
   */
  private setupOAuthHandlers(): void {
    ipcMain.handle('oauth:discover', async (_event, issuer: string) => {
      try {
        const discovery = await this.oauthManager.discover(issuer);
        return { success: true, data: discovery };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Discovery failed'
        };
      }
    });

    ipcMain.handle('oauth:getToken', async (_event, config: OAuth2Config) => {
      try {
        const token = await this.oauthManager.getToken(config);
        return { success: true, data: token };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Token request failed'
        };
      }
    });

    ipcMain.handle('oauth:refresh', async (_event, config: OAuth2Config, refreshToken: string) => {
      try {
        const token = await this.oauthManager.refreshToken(config, refreshToken);
        return { success: true, data: token };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Token refresh failed'
        };
      }
    });

    ipcMain.handle('oauth:introspect', async (_event, config: OAuth2Config, token: string) => {
      try {
        const result = await this.oauthManager.introspectToken(config, token);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Token introspection failed'
        };
      }
    });
  }

  /**
   * Setup file dialog handlers
   */
  private setupFileHandlers(): void {
    ipcMain.handle('files:pick', async (_event, options: { filters?: any[], properties?: string[] }) => {
      try {
        const result = await dialog.showOpenDialog({
          filters: options.filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: (options.properties as any) || ['openFile']
        });

        if (result.canceled || !result.filePaths.length) {
          return { success: false, canceled: true };
        }

        return { success: true, data: result.filePaths };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'File dialog failed'
        };
      }
    });

    ipcMain.handle('files:save', async (_event, options: { 
      defaultPath?: string, 
      filters?: any[], 
      content: string | Buffer 
    }) => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: options.defaultPath,
          filters: options.filters || [
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }

        writeFileSync(result.filePath, options.content);
        return { success: true, data: result.filePath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'File save failed'
        };
      }
    });
  }

  /**
   * Setup theme-related IPC handlers
   */
  private setupThemeHandlers(): void {
    ipcMain.handle('theme:getAvailable', () => {
      return { success: true, data: this.themeManager.getAvailableThemes() };
    });

    ipcMain.handle('theme:getCurrent', () => {
      return { success: true, data: this.themeManager.getCurrentTheme() };
    });

    ipcMain.handle('theme:setTheme', (_event, themeId: string) => {
      const success = this.themeManager.setTheme(themeId);
      return { success };
    });

    ipcMain.handle('theme:generateCSS', (_event, themeId: string) => {
      const theme = this.themeManager.getThemeById(themeId);
      if (theme) {
        const css = this.themeManager.generateCSSVariables(theme);
        return { success: true, data: css };
      }
      return { success: false, error: 'Theme not found' };
    });
  }

  /**
   * Setup import-related IPC handlers
   */
  private setupImportHandlers(): void {
    ipcMain.handle('import:postman', async (_event, filePath: string) => {
      try {
        const fileContent = readFileSync(filePath, 'utf8');
        const postmanData = JSON.parse(fileContent);
        
        // Validate collection
        const validation = this.postmanImporter.validateCollection(postmanData);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }

        // Import collection
        const collections = this.postmanImporter.importCollection(postmanData);
        
        // Save to store
        for (const collection of collections) {
          this.persistenceManager.saveCollection(collection);
        }

        const stats = this.postmanImporter.getCollectionStats(postmanData);
        return { success: true, data: { collections, stats } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Import failed'
        };
      }
    });

    ipcMain.handle('import:validate', (_event, content: string) => {
      try {
        const data = JSON.parse(content);
        const validation = this.postmanImporter.validateCollection(data);
        return { success: validation.valid, error: validation.error };
      } catch (error) {
        return { success: false, error: 'Invalid JSON format' };
      }
    });
  }
}

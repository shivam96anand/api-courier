import { contextBridge, ipcRenderer } from 'electron';
import { Collection, Request, Response, AppSettings } from '../shared/types';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // Store methods
  getCollections: (): Promise<Collection[]> => 
    ipcRenderer.invoke('store:get-collections'),
  
  saveCollection: (collection: Collection): Promise<void> => 
    ipcRenderer.invoke('store:save-collection', collection),
  
  deleteCollection: (id: string): Promise<void> => 
    ipcRenderer.invoke('store:delete-collection', id),

  saveRequest: (request: Request): Promise<void> => 
    ipcRenderer.invoke('store:save-request', request),

  deleteRequest: (id: string): Promise<void> => 
    ipcRenderer.invoke('store:delete-request', id),
  
  getSettings: (): Promise<AppSettings> => 
    ipcRenderer.invoke('store:get-settings'),
  
  saveSettings: (settings: Partial<AppSettings>): Promise<void> => 
    ipcRenderer.invoke('store:save-settings', settings),

  // File methods
  importCollection: (): Promise<Collection | null> => 
    ipcRenderer.invoke('file:import-collection'),
  
  exportCollection: (collection: Collection): Promise<boolean> => 
    ipcRenderer.invoke('file:export-collection', collection),

  // Request methods
  sendRequest: (request: Request): Promise<Response> => 
    ipcRenderer.invoke('request:send', request),
  
  cancelRequest: (requestId: string): Promise<void> => 
    ipcRenderer.invoke('request:cancel', requestId),

  // Window methods
  minimizeWindow: (): Promise<void> => 
    ipcRenderer.invoke('window:minimize'),
  
  maximizeWindow: (): Promise<void> => 
    ipcRenderer.invoke('window:maximize'),
  
  closeWindow: (): Promise<void> => 
    ipcRenderer.invoke('window:close'),
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

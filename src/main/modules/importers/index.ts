/**
 * Importer Registry and File Type Detection
 */

import { Collection, Environment, Globals } from '../../../shared/types';
import {
  mapPostmanCollection,
  mapPostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
} from './postman';
import { mapInsomniaExport, isInsomniaExport } from './insomnia';
import { isApiCourierExport, mapApiCourierExport } from './api-courier';
import * as yaml from 'js-yaml';

export type ImportKind =
  | 'api-courier-export'
  | 'postman-collection'
  | 'postman-environment'
  | 'insomnia'
  | 'unknown';

export interface ImportResult {
  kind: ImportKind;
  name: string;
  rootFolder?: Collection;
  environments: Environment[];
  globals?: Globals;
}

export interface ImportPreview {
  name: string;
  summary: {
    folders: number;
    requests: number;
    environments: number;
  };
  rootFolder?: Collection;
  environments: Environment[];
  kind?: ImportKind;
  globals?: Globals;
}

/**
 * Detects the type of import file and parses it
 */
export function detectAndParse(jsonData: any): ImportResult {
  // Detect Restbro native export first
  if (isApiCourierExport(jsonData)) {
    const { rootFolder, environments, globals } = mapApiCourierExport(jsonData);
    return {
      kind: 'api-courier-export',
      name: rootFolder.name,
      rootFolder,
      environments,
      globals,
    };
  }

  // Detect Insomnia Export
  if (isInsomniaExport(jsonData)) {
    const { rootFolder, environments } = mapInsomniaExport(jsonData);
    return {
      kind: 'insomnia',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }

  // Detect Postman Collection
  if (isPostmanCollection(jsonData)) {
    const { rootFolder, environments } = mapPostmanCollection(jsonData);
    return {
      kind: 'postman-collection',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }

  // Detect Postman Environment
  if (isPostmanEnvironment(jsonData)) {
    const environment = mapPostmanEnvironment(jsonData);
    return {
      kind: 'postman-environment',
      name: environment.name,
      environments: [environment],
    };
  }

  // Unknown format
  return {
    kind: 'unknown',
    name: 'Unknown Format',
    environments: [],
  };
}

/**
 * Generates a preview for the import
 */
export function generatePreview(importResult: ImportResult): ImportPreview {
  const summary = {
    folders: 0,
    requests: 0,
    environments: importResult.environments.length,
  };

  let previewName = importResult.name;

  if (importResult.rootFolder) {
    const counts = countCollectionItems(importResult.rootFolder);
    summary.folders = counts.folders;
    summary.requests = counts.requests;
  }

  const preview: ImportPreview = {
    name: previewName,
    summary,
    rootFolder: importResult.rootFolder,
    environments: importResult.environments,
    kind: importResult.kind,
  };
  if (importResult.globals) {
    preview.globals = importResult.globals;
  }
  return preview;
}

/**
 * Recursively counts folders and requests in a collection tree
 */
function countCollectionItems(collection: Collection): { folders: number; requests: number } {
  let folders = 0;
  let requests = 0;

  if (collection.type === 'folder') {
    folders++;
    if (collection.children) {
      collection.children.forEach(child => {
        const counts = countCollectionItems(child);
        folders += counts.folders;
        requests += counts.requests;
      });
    }
  } else if (collection.type === 'request') {
    requests++;
  }

  return { folders, requests };
}

/**
 * Parses a JSON or YAML file content string
 */
export function parseJsonFile(content: string): any {
  // Try JSON first
  try {
    return JSON.parse(content);
  } catch (jsonError) {
    // If JSON fails, try YAML
    try {
      return yaml.load(content);
    } catch (yamlError) {
      throw new Error(`Invalid file format. Must be valid JSON or YAML. JSON error: ${jsonError instanceof Error ? jsonError.message : 'Unknown'}. YAML error: ${yamlError instanceof Error ? yamlError.message : 'Unknown'}`);
    }
  }
}

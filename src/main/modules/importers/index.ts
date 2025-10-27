/**
 * Importer Registry and File Type Detection
 */

import { Collection, Environment } from '../../../shared/types';
import {
  mapPostmanCollection,
  mapPostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
} from './postman';
import { mapInsomniaExport, isInsomniaExport } from './insomnia';
import * as yaml from 'js-yaml';

export interface ImportResult {
  kind: 'postman-collection' | 'postman-environment' | 'insomnia' | 'unknown';
  name: string;
  rootFolder?: Collection;
  environments: Environment[];
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
}

/**
 * Detects the type of import file and parses it
 */
export function detectAndParse(jsonData: any): ImportResult {
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

    // If the root folder is a wrapper with children, show the children names instead
    if (
      importResult.rootFolder.type === 'folder' &&
      importResult.rootFolder.children &&
      importResult.rootFolder.children.length > 0 &&
      !importResult.rootFolder.request
    ) {
      // Show names of actual collections that will be imported
      const childNames = importResult.rootFolder.children.map(c => c.name).join(', ');
      previewName = `${importResult.rootFolder.children.length} collections: ${childNames}`;

      // Don't count the wrapper folder itself
      summary.folders = counts.folders - 1;
    }
  }

  return {
    name: previewName,
    summary,
    rootFolder: importResult.rootFolder,
    environments: importResult.environments,
  };
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

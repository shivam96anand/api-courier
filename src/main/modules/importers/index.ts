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
import { isRestbroExport, mapRestbroExport } from './restbro';
import {
  isHoppscotchCollection,
  isHoppscotchEnvironment,
  mapHoppscotchCollection,
  mapHoppscotchEnvironment,
} from './hoppscotch';
import { isBrunoCollectionDir, mapBrunoCollection } from './bruno';
import { isOpenApiDocument, mapOpenApiDocument } from './openapi';
import { isHarDocument, mapHarDocument } from './har';
import {
  isThunderClientCollection,
  isThunderClientEnvironment,
  mapThunderClientCollection,
  mapThunderClientEnvironment,
} from './thunder-client';
import { isPawExport, mapPawExport } from './paw';
import { isRestClientText, mapRestClientText } from './rest-client';
import { isWsdlDocument, mapWsdlDocument } from './wsdl';
import { isCurlCommand, mapCurlCommand } from './curl';
import * as yaml from 'js-yaml';

export type ImportKind =
  | 'restbro-export'
  | 'postman-collection'
  | 'postman-environment'
  | 'insomnia'
  | 'hoppscotch-collection'
  | 'hoppscotch-environment'
  | 'bruno'
  | 'openapi'
  | 'har'
  | 'thunder-client-collection'
  | 'thunder-client-environment'
  | 'paw'
  | 'rest-client'
  | 'wsdl'
  | 'curl'
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
 * Detects the type of import file (JSON/YAML payloads) and parses it.
 */
export function detectAndParse(jsonData: any): ImportResult {
  // Detect Restbro native export first
  if (isRestbroExport(jsonData)) {
    const { rootFolder, environments, globals } = mapRestbroExport(jsonData);
    return {
      kind: 'restbro-export',
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

  // Detect OpenAPI / Swagger (checked before Hoppscotch/Paw because the
  // signature is unambiguous: explicit `openapi:` or `swagger:` field).
  if (isOpenApiDocument(jsonData)) {
    const { rootFolder, environments } = mapOpenApiDocument(jsonData);
    return {
      kind: 'openapi',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }

  // Detect HAR (HTTP Archive). Unambiguous: top-level `log.entries[]`.
  if (isHarDocument(jsonData)) {
    const { rootFolder, environments } = mapHarDocument(jsonData);
    return {
      kind: 'har',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }

  // Detect Thunder Client (collection then environment).
  if (isThunderClientCollection(jsonData)) {
    const { rootFolder, environments } = mapThunderClientCollection(jsonData);
    return {
      kind: 'thunder-client-collection',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }
  if (isThunderClientEnvironment(jsonData)) {
    const env = mapThunderClientEnvironment(jsonData);
    return {
      kind: 'thunder-client-environment',
      name: env.name,
      environments: [env],
    };
  }

  // Detect Hoppscotch collection (checked after the formats above because
  // Hoppscotch JSON has no schema URL and is structurally permissive).
  if (isHoppscotchCollection(jsonData)) {
    const { rootFolder, environments } = mapHoppscotchCollection(jsonData);
    return {
      kind: 'hoppscotch-collection',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }

  // Detect Hoppscotch environment
  if (isHoppscotchEnvironment(jsonData)) {
    const environments = mapHoppscotchEnvironment(jsonData);
    return {
      kind: 'hoppscotch-environment',
      name: environments[0]?.name ?? 'Hoppscotch Environment',
      environments,
    };
  }

  // Detect Paw export last among JSON formats — its signature is the
  // loosest (numeric-keyed objects), so anything more specific must win.
  if (isPawExport(jsonData)) {
    const { rootFolder, environments } = mapPawExport(jsonData);
    return {
      kind: 'paw',
      name: rootFolder.name,
      rootFolder,
      environments,
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
 * Detect and parse text-based import payloads that aren't JSON/YAML
 * (REST Client `.http`, WSDL XML, raw cURL command).
 */
export function detectAndParseText(rawText: string): ImportResult {
  if (isWsdlDocument(rawText)) {
    const { rootFolder, environments } = mapWsdlDocument(rawText);
    return {
      kind: 'wsdl',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }
  if (isCurlCommand(rawText)) {
    const { rootFolder, environments } = mapCurlCommand(rawText);
    return {
      kind: 'curl',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }
  if (isRestClientText(rawText)) {
    const { rootFolder, environments } = mapRestClientText(rawText);
    return {
      kind: 'rest-client',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }
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

  const previewName = importResult.name;

  if (importResult.rootFolder) {
    // Skip the synthetic root wrapper; count only its children
    const children = importResult.rootFolder.children ?? [];
    let folders = 0;
    let requests = 0;
    children.forEach((child) => {
      const counts = countCollectionItems(child);
      folders += counts.folders;
      requests += counts.requests;
    });
    summary.folders = folders;
    summary.requests = requests;
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
function countCollectionItems(collection: Collection): {
  folders: number;
  requests: number;
} {
  let folders = 0;
  let requests = 0;

  if (collection.type === 'folder') {
    folders++;
    if (collection.children) {
      collection.children.forEach((child) => {
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
      throw new Error(
        `Invalid file format. Must be valid JSON or YAML. JSON error: ${jsonError instanceof Error ? jsonError.message : 'Unknown'}. YAML error: ${yamlError instanceof Error ? yamlError.message : 'Unknown'}`
      );
    }
  }
}

/**
 * Detect and parse a Bruno collection from a folder path. Bruno collections
 * are filesystem-based (a tree of `.bru` files) and therefore cannot go
 * through `detectAndParse` like JSON-based formats. Returns an `ImportResult`
 * shaped identically to the JSON path so the renderer/preview pipeline can
 * stay shared.
 */
export async function detectAndParseFolder(
  folderPath: string
): Promise<ImportResult> {
  if (await isBrunoCollectionDir(folderPath)) {
    const { rootFolder, environments } = await mapBrunoCollection(folderPath);
    return {
      kind: 'bruno',
      name: rootFolder.name,
      rootFolder,
      environments,
    };
  }
  return {
    kind: 'unknown',
    name: 'Unknown Format',
    environments: [],
  };
}

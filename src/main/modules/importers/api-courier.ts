/**
 * API Courier native export format importer
 */

import { Collection, Environment, Globals } from '../../../shared/types';
import { generateId } from './mappers';

export interface ApiCourierExportData {
  version?: string;
  type: 'api-courier-export';
  timestamp?: string;
  collection?: Collection;
  collections?: Collection[];
  environments?: Environment[];
  globals?: Globals;
}

export function isApiCourierExport(data: unknown): data is ApiCourierExportData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ApiCourierExportData).type === 'api-courier-export' &&
    ((data as ApiCourierExportData).collection !== undefined ||
      Array.isArray((data as ApiCourierExportData).collections))
  );
}

/**
 * Reassign IDs recursively so imported data does not conflict with existing state.
 */
function reassignCollectionIds(
  collection: Collection,
  idMap: Map<string, string>,
  parentId?: string
): Collection {
  const newId = generateId();
  idMap.set(collection.id, newId);

  const out: Collection = {
    ...collection,
    id: newId,
    parentId,
    createdAt: collection.createdAt ? new Date(collection.createdAt) : new Date(),
    updatedAt: collection.updatedAt ? new Date(collection.updatedAt) : new Date(),
  };

  if (out.request) {
    const newRequestId = generateId();
    idMap.set(out.request.id, newRequestId);
    // Also remap collectionId so folder variable resolution works after import
    const remappedCollectionId = out.request.collectionId
      ? (idMap.get(out.request.collectionId) ?? out.request.collectionId)
      : undefined;
    out.request = { ...out.request, id: newRequestId, collectionId: remappedCollectionId };
  }

  if (out.type === 'folder' && out.children && out.children.length > 0) {
    out.children = out.children.map((child) =>
      reassignCollectionIds(child, idMap, newId)
    );
  } else {
    out.children = undefined;
  }

  return out;
}

/**
 * Maps API Courier export to ImportResult shape. Assigns new IDs to avoid conflicts.
 */
export function mapApiCourierExport(data: ApiCourierExportData): {
  rootFolder: Collection;
  environments: Environment[];
  globals?: Globals;
} {
  const idMap = new Map<string, string>();
  const collections = data.collections ?? (data.collection ? [data.collection] : []);

  const rootFolder: Collection = {
    id: generateId(),
    name: 'API Courier Export',
    type: 'folder',
    children: collections.map((c) => reassignCollectionIds(c, idMap, undefined)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const environments: Environment[] = (data.environments ?? []).map((env) => ({
    ...env,
    id: generateId(),
    variables: { ...env.variables },
  }));

  return {
    rootFolder,
    environments,
    globals: data.globals,
  };
}

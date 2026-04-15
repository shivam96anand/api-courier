/**
 * Restbro native export format importer
 */

import { Collection, Environment, Globals } from '../../../shared/types';
import { generateId } from './mappers';

export interface RestbroExportData {
  version?: string;
  type: 'restbro-export' | 'api-courier-export';
  timestamp?: string;
  collection?: Collection;
  collections?: Collection[];
  environments?: Environment[];
  globals?: Globals;
}

export function isRestbroExport(data: unknown): data is RestbroExportData {
  return (
    typeof data === 'object' &&
    data !== null &&
    ((data as RestbroExportData).type === 'restbro-export' ||
      (data as RestbroExportData).type === 'api-courier-export') &&
    ((data as RestbroExportData).collection !== undefined ||
      Array.isArray((data as RestbroExportData).collections))
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
    createdAt: collection.createdAt
      ? new Date(collection.createdAt)
      : new Date(),
    updatedAt: collection.updatedAt
      ? new Date(collection.updatedAt)
      : new Date(),
  };

  if (out.request) {
    const newRequestId = generateId();
    idMap.set(out.request.id, newRequestId);
    // Also remap collectionId so folder variable resolution works after import
    const remappedCollectionId = out.request.collectionId
      ? (idMap.get(out.request.collectionId) ?? out.request.collectionId)
      : undefined;
    out.request = {
      ...out.request,
      id: newRequestId,
      collectionId: remappedCollectionId,
    };
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
 * Maps Restbro export to ImportResult shape. Assigns new IDs to avoid conflicts.
 */
export function mapRestbroExport(data: RestbroExportData): {
  rootFolder: Collection;
  environments: Environment[];
  globals?: Globals;
} {
  const idMap = new Map<string, string>();
  const collections =
    data.collections ?? (data.collection ? [data.collection] : []);

  const rootFolder: Collection = {
    id: generateId(),
    name: 'Restbro Export',
    type: 'folder',
    children: collections.map((c) =>
      reassignCollectionIds(c, idMap, undefined)
    ),
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

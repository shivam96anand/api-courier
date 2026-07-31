/**
 * @vitest-environment jsdom
 *
 * Regression tests for the "two requests merged" data-corruption bug.
 *
 * The persisted collections tree must never share nested object references
 * (params / headers / body / auth) with the live request editor. If it does,
 * an edit to the editor's working copy silently mutates the stored request —
 * and, transitively, other requests — which surfaced as two collection
 * requests whose URLs and parameters "merged".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionsCore } from '../collections-core';
import type { Collection, ApiRequest } from '../../../../shared/types';

function makeRequestCollection(id: string, request: ApiRequest): Collection {
  return {
    id,
    name: request.name,
    type: 'request',
    request,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Collection;
}

describe('CollectionsCore.updateCollectionRequest reference isolation', () => {
  let core: CollectionsCore;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Swallow the collections-changed event; we only care about state isolation.
    vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    core = new CollectionsCore();
  });

  function seed(collections: Collection[]): void {
    // Bypass setCollections() to avoid its DOM render + async persistence.
    (core as unknown as { collections: Collection[] }).collections =
      collections;
  }

  function storedRequest(requestId: string): ApiRequest {
    const flat = (core as unknown as { collections: Collection[] }).collections;
    const found = flat.find((c) => c.request?.id === requestId);
    return found!.request!;
  }

  it('does not store the live editor arrays by reference', () => {
    const original: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'GET',
      url: 'https://a.example.com',
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [{ key: 'X-A', value: '1', enabled: true }],
    };
    seed([makeRequestCollection('col-a', original)]);

    // The live editor working copy the renderer passes in on every keystroke.
    const editorRequest: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'GET',
      url: 'https://a.example.com/v2',
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [{ key: 'X-A', value: '1', enabled: true }],
    };

    core.updateCollectionRequest('col-a', editorRequest);

    const stored = storedRequest('req-a');
    expect(stored.url).toBe('https://a.example.com/v2');
    // Stored arrays must be independent copies, not the editor's arrays.
    expect(stored.params).not.toBe(editorRequest.params);
    expect(stored.headers).not.toBe(editorRequest.headers);
  });

  it('is immune to later mutation of the editor working copy', () => {
    const original: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'GET',
      url: 'https://a.example.com',
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [],
    };
    seed([makeRequestCollection('col-a', original)]);

    const editorRequest: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'GET',
      url: 'https://a.example.com',
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [],
    };

    core.updateCollectionRequest('col-a', editorRequest);

    // Simulate the user continuing to edit a DIFFERENT request (or the same
    // editor being reused) — this must never touch the persisted collection.
    (editorRequest.params as Array<{ key: string }>).push({
      key: 'leaked',
      value: 'x',
      enabled: true,
    } as never);
    editorRequest.url = 'https://tampered.example.com';

    const stored = storedRequest('req-a');
    expect((stored.params as unknown[]).length).toBe(1);
    expect(stored.url).toBe('https://a.example.com');
  });

  it('keeps two sibling requests fully independent', () => {
    const reqA: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'GET',
      url: 'https://a.example.com',
      params: [{ key: 'a', value: '1', enabled: true }],
      headers: [],
    };
    const reqB: ApiRequest = {
      id: 'req-b',
      name: 'B',
      method: 'GET',
      url: 'https://b.example.com',
      params: [{ key: 'b', value: '2', enabled: true }],
      headers: [],
    };
    seed([
      makeRequestCollection('col-a', reqA),
      makeRequestCollection('col-b', reqB),
    ]);

    core.updateCollectionRequest('col-a', {
      ...reqA,
      url: 'https://a.example.com/edited',
      params: [{ key: 'a', value: '99', enabled: true }],
    });

    const storedA = storedRequest('req-a');
    const storedB = storedRequest('req-b');

    expect(storedA.url).toBe('https://a.example.com/edited');
    // B must be untouched by edits to A.
    expect(storedB.url).toBe('https://b.example.com');
    expect((storedB.params as Array<{ value: string }>)[0].value).toBe('2');
    expect(storedA.params).not.toBe(storedB.params);
  });
});

/**
 * Regression tests for the "changing an HTTP verb doesn't update the sidebar
 * method badge" bug. The sidebar renders `collection.request.method`, so the
 * tree must be re-rendered when the verb changes — but NOT on unrelated edits
 * (URL / headers / body), to avoid rebuilding the tree on every keystroke.
 */
describe('CollectionsCore.updateCollectionRequest sidebar refresh on method change', () => {
  let core: CollectionsCore;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    core = new CollectionsCore();
  });

  function seed(collections: Collection[]): void {
    (core as unknown as { collections: Collection[] }).collections =
      collections;
  }

  function spyRenderCollections(): ReturnType<typeof vi.spyOn> {
    return vi
      .spyOn(
        core as unknown as { renderCollections: () => void },
        'renderCollections'
      )
      .mockImplementation(() => undefined);
  }

  it('re-renders the tree when the HTTP method changes', () => {
    const original: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'POST',
      url: 'https://a.example.com',
      params: [],
      headers: [],
    };
    seed([makeRequestCollection('col-a', original)]);
    const renderSpy = spyRenderCollections();

    core.updateCollectionRequest('col-a', { ...original, method: 'PATCH' });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const stored = (
      core as unknown as { collections: Collection[] }
    ).collections.find((c) => c.request?.id === 'req-a');
    expect(stored?.request?.method).toBe('PATCH');
  });

  it('does not re-render the tree when the method is unchanged', () => {
    const original: ApiRequest = {
      id: 'req-a',
      name: 'A',
      method: 'POST',
      url: 'https://a.example.com',
      params: [],
      headers: [],
    };
    seed([makeRequestCollection('col-a', original)]);
    const renderSpy = spyRenderCollections();

    // Only the URL changed — the badge is unaffected, so skip the tree rebuild.
    core.updateCollectionRequest('col-a', {
      ...original,
      url: 'https://a.example.com/v2',
    });

    expect(renderSpy).not.toHaveBeenCalled();
  });
});

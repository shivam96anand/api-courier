// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadCompareState, saveCompareState } from '../persist';
import type { JsonCompareUIState } from '../../../../../shared/types';

interface FakeStore {
  jsonCompareUIState?: Partial<JsonCompareUIState>;
}

describe('persist (JSON Compare state)', () => {
  let fakeStore: FakeStore;
  let getMock: ReturnType<typeof vi.fn>;
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeStore = {};
    getMock = vi.fn(async () => fakeStore);
    setMock = vi.fn(async (updates: FakeStore) => {
      Object.assign(fakeStore, updates);
    });

    Object.defineProperty(window, 'restbro', {
      configurable: true,
      writable: true,
      value: { store: { get: getMock, set: setMock } },
    });

    // Provide an in-memory localStorage shim (jsdom may not expose one
    // depending on environment).
    const memory: Record<string, string> = {};
    const localStorageStub: Storage = {
      get length() {
        return Object.keys(memory).length;
      },
      clear: () => {
        for (const k of Object.keys(memory)) delete memory[k];
      },
      getItem: (k: string) =>
        Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null,
      key: (i: number) => Object.keys(memory)[i] ?? null,
      removeItem: (k: string) => {
        delete memory[k];
      },
      setItem: (k: string, v: string) => {
        memory[k] = String(v);
      },
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: localStorageStub,
    });
  });

  afterEach(() => {
    delete (window as unknown as { restbro?: unknown }).restbro;
  });

  it('returns defaults when nothing is stored and there is no legacy state', async () => {
    const state = await loadCompareState();
    expect(state.leftJson).toBe('');
    expect(state.rightJson).toBe('');
    expect(state.tableFilter).toBe('');
    expect(state.selectedTypes).toEqual(['added', 'removed', 'changed']);
    expect(state.options?.ignoreArrayOrder).toBe(true);
  });

  it('loads previously persisted state from the store', async () => {
    fakeStore.jsonCompareUIState = {
      leftJson: '{"a":1}',
      rightJson: '{"b":2}',
      tableFilter: 'name',
      selectedTypes: ['added'],
      options: { sortKeys: true },
    };
    const state = await loadCompareState();
    expect(state.leftJson).toBe('{"a":1}');
    expect(state.rightJson).toBe('{"b":2}');
    expect(state.tableFilter).toBe('name');
    expect(state.selectedTypes).toEqual(['added']);
    expect(state.options?.sortKeys).toBe(true);
    // defaulted from DEFAULT_OPTIONS
    expect(state.options?.ignoreArrayOrder).toBe(true);
  });

  it('migrates legacy localStorage state into the store on first load', async () => {
    localStorage.setItem(
      'restbro.jsonCompare.v1',
      JSON.stringify({
        leftJson: '{"x":1}',
        rightJson: '{"x":2}',
        tableFilter: 'foo',
        selectedTypes: ['changed'],
      })
    );

    const state = await loadCompareState();
    expect(state.leftJson).toBe('{"x":1}');
    expect(state.tableFilter).toBe('foo');
    expect(state.selectedTypes).toEqual(['changed']);
    // legacy key removed
    expect(localStorage.getItem('restbro.jsonCompare.v1')).toBeNull();
  });
});

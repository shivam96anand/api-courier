import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadCompareState,
  saveCompareState,
  clearCompareState,
} from '../../state/persist';
import type { CompareState } from '../../types';

// Minimal localStorage stub
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

const STORAGE_KEY = 'restbro.jsonCompare.v1';

describe('persist (JSON Compare state)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear our fake store
    for (const key of Object.keys(store)) delete store[key];
  });

  describe('loadCompareState', () => {
    it('returns default state when nothing is stored', () => {
      const state = loadCompareState();
      expect(state).toEqual({
        leftJson: '',
        rightJson: '',
        tableFilter: '',
        selectedTypes: ['added', 'removed', 'changed'],
      });
    });

    it('returns default state for invalid JSON', () => {
      store[STORAGE_KEY] = 'not-json';
      const state = loadCompareState();
      expect(state.leftJson).toBe('');
    });

    it('returns stored state when valid', () => {
      const saved: CompareState = {
        leftJson: '{"a":1}',
        rightJson: '{"b":2}',
        tableFilter: 'name',
        selectedTypes: ['added'],
      };
      store[STORAGE_KEY] = JSON.stringify(saved);
      const state = loadCompareState();
      expect(state).toEqual(saved);
    });

    it('returns default state when structure is invalid', () => {
      store[STORAGE_KEY] = JSON.stringify({ leftJson: 123 }); // wrong type
      const state = loadCompareState();
      expect(state.leftJson).toBe('');
    });
  });

  describe('saveCompareState', () => {
    it('persists state to localStorage', () => {
      const state: CompareState = {
        leftJson: '{}',
        rightJson: '[]',
        tableFilter: '',
        selectedTypes: ['changed'],
      };
      saveCompareState(state);
      expect(store[STORAGE_KEY]).toBe(JSON.stringify(state));
    });
  });

  describe('clearCompareState', () => {
    it('removes key from localStorage', () => {
      store[STORAGE_KEY] = '{}';
      clearCompareState();
      expect(store[STORAGE_KEY]).toBeUndefined();
    });
  });
});

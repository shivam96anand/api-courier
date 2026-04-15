import { describe, it, expect, beforeEach } from 'vitest';
import { JsonSearch } from '../search';
import { JsonParser } from '../parser';

describe('JsonSearch', () => {
  let search: JsonSearch;

  beforeEach(() => {
    search = new JsonSearch();
  });

  function makeExpandedNodes(data: any) {
    const nodes = JsonParser.parseToNodes(data);
    JsonParser.expandAll(nodes);
    return nodes;
  }

  describe('performSearch', () => {
    it('returns empty matches for empty query', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      const result = search.performSearch('', nodes);
      expect(result.matches).toHaveLength(0);
      expect(result.currentIndex).toBe(-1);
    });

    it('returns empty matches for whitespace-only query', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      const result = search.performSearch('   ', nodes);
      expect(result.matches).toHaveLength(0);
    });

    it('finds matches in keys', () => {
      const nodes = makeExpandedNodes({ name: 'Alice', age: 30 });
      const result = search.performSearch('name', nodes);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches.some((m) => m.isKey)).toBe(true);
    });

    it('finds matches in string values', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      const result = search.performSearch('Alice', nodes);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches.some((m) => !m.isKey)).toBe(true);
    });

    it('finds matches in number values', () => {
      const nodes = makeExpandedNodes({ count: 42 });
      const result = search.performSearch('42', nodes);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('finds matches in boolean values', () => {
      const nodes = makeExpandedNodes({ active: true });
      const result = search.performSearch('true', nodes);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('performs case-insensitive search', () => {
      const nodes = makeExpandedNodes({ Name: 'Alice' });
      const result = search.performSearch('name', nodes);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('returns no matches when nothing matches', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      const result = search.performSearch('zzzzz', nodes);
      expect(result.matches).toHaveLength(0);
      expect(result.currentIndex).toBe(-1);
    });

    it('sets currentIndex to 0 when matches found', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      const result = search.performSearch('Alice', nodes);
      expect(result.currentIndex).toBe(0);
    });

    it('finds multiple occurrences of the same term', () => {
      const nodes = makeExpandedNodes({ aa: 'aa', bb: 'aa' });
      const result = search.performSearch('aa', nodes);
      // Should find in keys and values
      expect(result.matches.length).toBeGreaterThanOrEqual(2);
    });

    it('does not search in object/array type nodes for values', () => {
      const nodes = makeExpandedNodes({ obj: { inner: 1 } });
      // "obj" node is type 'object', its value shouldn't be searched
      const result = search.performSearch('[object', nodes);
      expect(result.matches.every((m) => m.isKey || m.node.type !== 'object')).toBe(true);
    });
  });

  describe('navigateSearch', () => {
    it('navigates forward through matches', () => {
      const nodes = makeExpandedNodes({ a: 'x', b: 'x', c: 'x' });
      search.performSearch('x', nodes);

      const result1 = search.navigateSearch(1);
      expect(result1.currentIndex).toBe(1);

      const result2 = search.navigateSearch(1);
      expect(result2.currentIndex).toBe(2);
    });

    it('wraps around going forward', () => {
      const nodes = makeExpandedNodes({ a: 'x', b: 'x' });
      const initial = search.performSearch('x', nodes);
      const total = initial.matches.length;

      // Navigate to last
      for (let i = 0; i < total - 1; i++) {
        search.navigateSearch(1);
      }
      // Should wrap to 0
      const result = search.navigateSearch(1);
      expect(result.currentIndex).toBe(0);
    });

    it('navigates backward through matches', () => {
      const nodes = makeExpandedNodes({ a: 'x', b: 'x', c: 'x' });
      search.performSearch('x', nodes);

      // Go forward first
      search.navigateSearch(1);
      const result = search.navigateSearch(-1);
      expect(result.currentIndex).toBe(0);
    });

    it('wraps around going backward from first match', () => {
      const nodes = makeExpandedNodes({ a: 'x', b: 'x' });
      const initial = search.performSearch('x', nodes);
      const total = initial.matches.length;

      const result = search.navigateSearch(-1);
      expect(result.currentIndex).toBe(total - 1);
    });

    it('returns unchanged state when no matches', () => {
      const result = search.navigateSearch(1);
      expect(result.matches).toHaveLength(0);
      expect(result.currentIndex).toBe(-1);
    });
  });

  describe('clearSearch', () => {
    it('clears all search state', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      search.performSearch('Alice', nodes);
      const result = search.clearSearch();
      expect(result.matches).toHaveLength(0);
      expect(result.currentIndex).toBe(-1);
    });
  });

  describe('getCurrentMatch', () => {
    it('returns null when no search performed', () => {
      expect(search.getCurrentMatch()).toBeNull();
    });

    it('returns current match after search', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      search.performSearch('Alice', nodes);
      const match = search.getCurrentMatch();
      expect(match).not.toBeNull();
    });

    it('returns null after clearing', () => {
      const nodes = makeExpandedNodes({ name: 'Alice' });
      search.performSearch('Alice', nodes);
      search.clearSearch();
      expect(search.getCurrentMatch()).toBeNull();
    });
  });

  describe('getSearchInfo', () => {
    it('returns zeros when no search', () => {
      expect(search.getSearchInfo()).toEqual({ total: 0, current: 0 });
    });

    it('returns correct info after search', () => {
      const nodes = makeExpandedNodes({ a: 'x', b: 'x' });
      const result = search.performSearch('x', nodes);
      const info = search.getSearchInfo();
      expect(info.total).toBe(result.matches.length);
      expect(info.current).toBe(1); // 0-index + 1
    });
  });

  describe('getSearchQuery', () => {
    it('returns empty string by default', () => {
      expect(search.getSearchQuery()).toBe('');
    });

    it('returns the current query', () => {
      const nodes = makeExpandedNodes({ name: 'test' });
      search.performSearch('test', nodes);
      expect(search.getSearchQuery()).toBe('test');
    });
  });

  describe('getMatches / getCurrentIndex', () => {
    it('returns matches array', () => {
      const nodes = makeExpandedNodes({ name: 'test' });
      search.performSearch('test', nodes);
      expect(search.getMatches().length).toBeGreaterThan(0);
      expect(search.getCurrentIndex()).toBe(0);
    });
  });
});

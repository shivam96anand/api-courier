import { describe, it, expect } from 'vitest';
import { JsonParser } from '../parser';

describe('JsonParser', () => {
  describe('getValueType', () => {
    it('returns "null" for null', () => {
      expect(JsonParser.getValueType(null)).toBe('null');
    });

    it('returns "array" for arrays', () => {
      expect(JsonParser.getValueType([])).toBe('array');
      expect(JsonParser.getValueType([1, 2, 3])).toBe('array');
    });

    it('returns "object" for plain objects', () => {
      expect(JsonParser.getValueType({})).toBe('object');
      expect(JsonParser.getValueType({ a: 1 })).toBe('object');
    });

    it('returns "string" for strings', () => {
      expect(JsonParser.getValueType('hello')).toBe('string');
      expect(JsonParser.getValueType('')).toBe('string');
    });

    it('returns "number" for numbers', () => {
      expect(JsonParser.getValueType(42)).toBe('number');
      expect(JsonParser.getValueType(0)).toBe('number');
      expect(JsonParser.getValueType(-3.14)).toBe('number');
    });

    it('returns "boolean" for booleans', () => {
      expect(JsonParser.getValueType(true)).toBe('boolean');
      expect(JsonParser.getValueType(false)).toBe('boolean');
    });

    it('returns "string" for undefined', () => {
      expect(JsonParser.getValueType(undefined)).toBe('string');
    });
  });

  describe('parseToNodes', () => {
    it('returns empty array for null input', () => {
      expect(JsonParser.parseToNodes(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      expect(JsonParser.parseToNodes(undefined)).toEqual([]);
    });

    it('parses a simple object', () => {
      const nodes = JsonParser.parseToNodes({ name: 'test', count: 5 });
      expect(nodes).toHaveLength(1);

      const root = nodes[0];
      expect(root.type).toBe('object');
      expect(root.level).toBe(0);
      expect(root.children).toHaveLength(2);
      expect(root.children![0].key).toBe('name');
      expect(root.children![0].value).toBe('test');
      expect(root.children![0].type).toBe('string');
      expect(root.children![1].key).toBe('count');
      expect(root.children![1].value).toBe(5);
      expect(root.children![1].type).toBe('number');
    });

    it('parses an array', () => {
      const nodes = JsonParser.parseToNodes([1, 'two', true]);
      expect(nodes).toHaveLength(1);

      const root = nodes[0];
      expect(root.type).toBe('array');
      expect(root.children).toHaveLength(3);
      expect(root.children![0].key).toBe('0');
      expect(root.children![0].value).toBe(1);
      expect(root.children![1].key).toBe('1');
      expect(root.children![1].value).toBe('two');
      expect(root.children![2].key).toBe('2');
      expect(root.children![2].value).toBe(true);
    });

    it('parses nested objects', () => {
      const data = { user: { name: 'Alice', age: 30 } };
      const nodes = JsonParser.parseToNodes(data);
      const root = nodes[0];

      expect(root.children).toHaveLength(1);
      const user = root.children![0];
      expect(user.key).toBe('user');
      expect(user.type).toBe('object');
      expect(user.level).toBe(1);
      expect(user.children).toHaveLength(2);
      expect(user.children![0].key).toBe('name');
      expect(user.children![1].key).toBe('age');
    });

    it('handles empty objects and arrays', () => {
      const nodes = JsonParser.parseToNodes({ empty: {}, list: [] });
      const root = nodes[0];

      expect(root.children![0].type).toBe('object');
      expect(root.children![0].children).toHaveLength(0);
      expect(root.children![1].type).toBe('array');
      expect(root.children![1].children).toHaveLength(0);
    });

    it('parses primitive root values', () => {
      const strNodes = JsonParser.parseToNodes('hello');
      expect(strNodes).toHaveLength(1);
      expect(strNodes[0].type).toBe('string');
      expect(strNodes[0].value).toBe('hello');

      const numNodes = JsonParser.parseToNodes(42);
      expect(numNodes).toHaveLength(1);
      expect(numNodes[0].type).toBe('number');

      const boolNodes = JsonParser.parseToNodes(true);
      expect(boolNodes).toHaveLength(1);
      expect(boolNodes[0].type).toBe('boolean');
    });

    it('sets parent references correctly', () => {
      const nodes = JsonParser.parseToNodes({ a: 1 });
      const root = nodes[0];
      expect(root.parent).toBeUndefined();
      expect(root.children![0].parent).toBe(root);
    });

    it('expands nodes based on response size (small)', () => {
      // Small response: should expand more levels
      const nodes = JsonParser.parseToNodes(
        { a: { b: { c: { d: 1 } } } },
        100 // 100 bytes - very small
      );
      const root = nodes[0];
      expect(root.isExpanded).toBe(true); // Level 0 < 4
      expect(root.children![0].isExpanded).toBe(true); // Level 1 < 4
    });

    it('limits expansion for large responses', () => {
      // Large response (> 5MB): only root expanded
      const nodes = JsonParser.parseToNodes(
        { a: { b: 1 } },
        6 * 1024 * 1024
      );
      const root = nodes[0];
      expect(root.isExpanded).toBe(true); // Level 0 < 1
      expect(root.children![0].isExpanded).toBe(false); // Level 1 >= 1
    });

    it('assigns line numbers sequentially', () => {
      const nodes = JsonParser.parseToNodes({ a: 1, b: 2 });
      const root = nodes[0];
      expect(root.lineNumber).toBe(1);
      expect(root.children![0].lineNumber).toBe(2);
      expect(root.children![1].lineNumber).toBe(3);
    });
  });

  describe('findNodeByLineNumber', () => {
    it('finds a node at a given line number', () => {
      const nodes = JsonParser.parseToNodes({ a: 1, b: 2 });
      const found = JsonParser.findNodeByLineNumber(nodes, 2);
      expect(found).not.toBeNull();
      expect(found!.key).toBe('a');
    });

    it('returns null when line number not found', () => {
      const nodes = JsonParser.parseToNodes({ a: 1 });
      expect(JsonParser.findNodeByLineNumber(nodes, 999)).toBeNull();
    });

    it('returns null for empty nodes array', () => {
      expect(JsonParser.findNodeByLineNumber([], 1)).toBeNull();
    });
  });

  describe('getVisibleNodes', () => {
    it('returns only the root when collapsed', () => {
      const nodes = JsonParser.parseToNodes({ a: 1, b: 2 });
      nodes[0].isExpanded = false;
      const visible = JsonParser.getVisibleNodes(nodes);
      expect(visible).toHaveLength(1);
    });

    it('returns root and children when expanded', () => {
      const nodes = JsonParser.parseToNodes({ a: 1, b: 2 });
      nodes[0].isExpanded = true;
      const visible = JsonParser.getVisibleNodes(nodes);
      expect(visible).toHaveLength(3); // root + 2 children
    });

    it('returns empty for empty nodes', () => {
      expect(JsonParser.getVisibleNodes([])).toHaveLength(0);
    });
  });

  describe('getVisibleNodesWithClosingBrackets', () => {
    it('includes closing brackets for expanded objects', () => {
      const nodes = JsonParser.parseToNodes({ a: 1 });
      nodes[0].isExpanded = true;
      const result = JsonParser.getVisibleNodesWithClosingBrackets(nodes);
      // root + child "a" + closing bracket
      expect(result).toHaveLength(3);
      expect(result[result.length - 1].isClosingBracket).toBe(true);
    });

    it('does not add closing bracket for collapsed nodes', () => {
      const nodes = JsonParser.parseToNodes({ a: 1 });
      nodes[0].isExpanded = false;
      const result = JsonParser.getVisibleNodesWithClosingBrackets(nodes);
      expect(result).toHaveLength(1);
      expect(result[0].isClosingBracket).toBe(false);
    });
  });

  describe('expandAll / collapseAll', () => {
    it('expandAll expands all object/array nodes', () => {
      const nodes = JsonParser.parseToNodes({ a: { b: [1, 2] } });
      JsonParser.collapseAll(nodes);
      JsonParser.expandAll(nodes);

      const root = nodes[0];
      expect(root.isExpanded).toBe(true);
      expect(root.children![0].isExpanded).toBe(true);
      expect(root.children![0].children![0].isExpanded).toBe(true);
    });

    it('collapseAll collapses all nodes', () => {
      const nodes = JsonParser.parseToNodes({ a: { b: 1 } });
      JsonParser.expandAll(nodes);
      JsonParser.collapseAll(nodes);

      expect(nodes[0].isExpanded).toBe(false);
      expect(nodes[0].children![0].isExpanded).toBe(false);
    });

    it('handles empty nodes array', () => {
      expect(() => JsonParser.expandAll([])).not.toThrow();
      expect(() => JsonParser.collapseAll([])).not.toThrow();
    });
  });
});

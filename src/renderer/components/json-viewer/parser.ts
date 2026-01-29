import { JsonNode } from './types';

export class JsonParser {
  public static parseToNodes(jsonData: any, responseSize?: number): JsonNode[] {
    const nodes: JsonNode[] = [];
    let lineNumber = 1;

    // Determine expansion strategy based on response size
    const autoExpandDepth = this.calculateAutoExpandDepth(responseSize);

    const parseNode = (key: string, value: any, level: number, parent?: JsonNode): JsonNode => {
      const type = JsonParser.getValueType(value);

      const node: JsonNode = {
        key,
        value,
        type,
        level,
        isExpanded: level < autoExpandDepth,
        parent,
        lineNumber: lineNumber++
      };

      if (type === 'object' || type === 'array') {
        node.children = [];
        if (type === 'object') {
          Object.keys(value).forEach(childKey => {
            const childNode = parseNode(childKey, value[childKey], level + 1, node);
            node.children!.push(childNode);
          });
        } else {
          value.forEach((item: any, index: number) => {
            const childNode = parseNode(`${index}`, item, level + 1, node);
            node.children!.push(childNode);
          });
        }
      }

      return node;
    };

    if (jsonData !== null && jsonData !== undefined) {
      const rootType = JsonParser.getValueType(jsonData);

      if (rootType === 'object' || rootType === 'array') {
        const rootNode = parseNode('', jsonData, 0, undefined);
        nodes.push(rootNode);
      } else {
        const rootNode = parseNode('', jsonData, 0, undefined);
        nodes.push(rootNode);
      }
    }

    return nodes;
  }

  public static getValueType(value: any): JsonNode['type'] {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  public static findNodeByLineNumber(nodes: JsonNode[], lineNumber: number): JsonNode | null {
    const searchInNode = (node: JsonNode): JsonNode | null => {
      if (node.lineNumber === lineNumber) {
        return node;
      }

      if (node.children) {
        for (const child of node.children) {
          const found = searchInNode(child);
          if (found) return found;
        }
      }

      return null;
    };

    for (const rootNode of nodes) {
      const found = searchInNode(rootNode);
      if (found) return found;
    }

    return null;
  }

  public static getVisibleNodes(nodes: JsonNode[]): JsonNode[] {
    const visibleNodes: JsonNode[] = [];

    const addVisibleNodes = (node: JsonNode) => {
      visibleNodes.push(node);
      if (node.isExpanded && node.children) {
        node.children.forEach(child => addVisibleNodes(child));
      }
    };

    if (nodes.length > 0) {
      addVisibleNodes(nodes[0]);
    }

    return visibleNodes;
  }

  public static getVisibleNodesWithClosingBrackets(nodes: JsonNode[]): Array<{node?: JsonNode, isClosingBracket: boolean}> {
    const result: Array<{node?: JsonNode, isClosingBracket: boolean}> = [];

    const addVisibleNodes = (node: JsonNode) => {
      result.push({node, isClosingBracket: false});

      if (node.isExpanded && node.children) {
        node.children.forEach(child => addVisibleNodes(child));

        // Always add closing bracket for objects/arrays when expanded
        if (node.type === 'object' || node.type === 'array') {
          result.push({node, isClosingBracket: true});
        }
      }
    };

    if (nodes.length > 0) {
      addVisibleNodes(nodes[0]);
    }

    return result;
  }

  public static expandAll(nodes: JsonNode[]): void {
    const expandNode = (node: JsonNode) => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = true;
      }
      if (node.children) {
        node.children.forEach(child => expandNode(child));
      }
    };

    if (nodes.length > 0) {
      expandNode(nodes[0]);
    }
  }

  public static collapseAll(nodes: JsonNode[]): void {
    const collapseNode = (node: JsonNode) => {
      if (node.type === 'object' || node.type === 'array') {
        node.isExpanded = false;
      }
      if (node.children) {
        node.children.forEach(child => collapseNode(child));
      }
    };

    if (nodes.length > 0) {
      collapseNode(nodes[0]);
    }
  }

  /**
   * Count total nodes in JSON data for expansion strategy
   */
  private static countNodes(data: any, maxCount = 500): number {
    let count = 0;

    const traverse = (value: any): void => {
      if (count >= maxCount) return;

      count++;

      if (value && typeof value === 'object') {
        Object.values(value).forEach(child => traverse(child));
      }
    };

    traverse(data);
    return count;
  }

  /**
   * Calculate optimal auto-expand depth based on response size
   * Simple rule: < 1MB = expand everything, >= 1MB = conservative expansion
   */
  private static calculateAutoExpandDepth(responseSize?: number): number {
    const ONE_MB = 1024 * 1024; // 1MB in bytes

    // If size unknown, use conservative default
    if (responseSize === undefined) {
      console.log('[JsonParser] Response size unknown, using default expansion depth: 3');
      return 3;
    }

    // < 1MB: expand everything (use very high depth)
    if (responseSize < ONE_MB) {
      console.log(`[JsonParser] Response size ${responseSize} bytes (< 1MB), expanding all levels`);
      return 999; // Effectively infinite for practical purposes
    }

    // >= 1MB: use size-based conservative expansion
    const FIVE_MB = 5 * ONE_MB;
    const TEN_MB = 10 * ONE_MB;

    if (responseSize < FIVE_MB) {
      console.log(`[JsonParser] Response size ${responseSize} bytes (1-5MB), expanding 3 levels`);
      return 3;
    }
    if (responseSize < TEN_MB) {
      console.log(`[JsonParser] Response size ${responseSize} bytes (5-10MB), expanding 2 levels`);
      return 2;
    }
    console.log(`[JsonParser] Response size ${responseSize} bytes (>10MB), expanding only root`);
    return 1;
  }
}
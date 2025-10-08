import { JsonNode } from './types';

export class JsonParser {
  public static parseToNodes(jsonData: any): JsonNode[] {
    const nodes: JsonNode[] = [];
    let lineNumber = 1;

    const parseNode = (key: string, value: any, level: number, parent?: JsonNode): JsonNode => {
      const type = JsonParser.getValueType(value);
      const node: JsonNode = {
        key,
        value,
        type,
        level,
        isExpanded: level < 2,
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
}
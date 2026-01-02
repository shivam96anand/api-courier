export interface JsonNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  level: number;
  isExpanded: boolean;
  parent?: JsonNode;
  children?: JsonNode[];
  lineNumber: number;
  path?: string; // Path from root for state persistence (e.g., "data.users[0].name")
}

export interface SearchMatch {
  node: JsonNode;
  lineNumber: number;
  text: string;
  startIndex: number;
  endIndex: number;
  isKey?: boolean;
}
export interface JsonNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  level: number;
  isExpanded: boolean;
  parent?: JsonNode;
  children?: JsonNode[];
  lineNumber: number;
}

export interface SearchMatch {
  node: JsonNode;
  lineNumber: number;
  text: string;
  startIndex: number;
  endIndex: number;
  isKey?: boolean;
}
/**
 * JSON utilities with safety guards and worker support
 * Handles parsing, formatting, validation, and tree building
 */

import {
  JsonNode,
  JsonValueType,
  JsonParseResult,
  FormatResult,
  SearchMatch,
  WorkerMessage,
  WorkerResponse,
  VIEWER_CONSTANTS
} from '../types';

/**
 * Worker manager for offloading heavy JSON operations
 */
export class JsonWorkerManager {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingMessages = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: number;
  }>();

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    try {
      // Create worker from inline script since we can't use separate files in Electron renderer
      const workerScript = this.getWorkerScript();
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));

      this.worker.onmessage = (event) => {
        const response: WorkerResponse = event.data;
        const pending = this.pendingMessages.get(response.id);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(response.id);

          if (response.success) {
            pending.resolve(response.result);
          } else {
            pending.reject(new Error(response.error || 'Worker operation failed'));
          }
        }
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.fallbackToMainThread();
      };
    } catch (error) {
      console.warn('Failed to create worker, falling back to main thread:', error);
      this.fallbackToMainThread();
    }
  }

  private getWorkerScript(): string {
    return `
      // JSON Worker Script
      function safeJsonParse(text) {
        try {
          const parsed = JSON.parse(text);
          return { success: true, data: parsed };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }

      function formatJson(data, indent = 2) {
        try {
          const formatted = JSON.stringify(data, null, indent);
          return { success: true, formatted };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }

      function minifyJson(data) {
        try {
          const minified = JSON.stringify(data);
          return { success: true, formatted: minified };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }

      function validateJson(text) {
        try {
          JSON.parse(text);
          return { success: true, valid: true };
        } catch (error) {
          return { success: true, valid: false, error: error.message };
        }
      }

      // Simple JSONPath implementation
      function evaluateJsonPath(data, path) {
        try {
          const matches = [];

          if (path === '$') {
            matches.push({ path: '$', value: data, jsonPath: '$' });
            return { success: true, matches };
          }

          // Basic path resolution (simplified for safety)
          const parts = path.replace(/^\\$\\./, '').split('.');

          function traverse(obj, currentPath, jsonPath) {
            if (typeof obj !== 'object' || obj === null) return;

            Object.keys(obj).forEach(key => {
              const value = obj[key];
              const fullPath = currentPath ? currentPath + '.' + key : key;
              const fullJsonPath = jsonPath + '.' + key;

              if (parts.some(part => key.includes(part) || part === '*')) {
                matches.push({
                  path: fullPath,
                  value: value,
                  jsonPath: fullJsonPath
                });
              }

              if (typeof value === 'object' && value !== null) {
                traverse(value, fullPath, fullJsonPath);
              }
            });
          }

          traverse(data, '', '$');
          return { success: true, matches };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }

      // Worker message handler
      self.onmessage = function(event) {
        const message = event.data;
        let result;

        try {
          switch (message.type) {
            case 'parse':
              result = safeJsonParse(message.payload.text);
              break;
            case 'format':
              result = formatJson(message.payload.data, message.payload.indent);
              break;
            case 'minify':
              result = minifyJson(message.payload.data);
              break;
            case 'validate':
              result = validateJson(message.payload.text);
              break;
            case 'jsonpath':
              result = evaluateJsonPath(message.payload.data, message.payload.path);
              break;
            default:
              result = { success: false, error: 'Unknown operation type' };
          }
        } catch (error) {
          result = { success: false, error: error.message };
        }

        self.postMessage({
          id: message.id,
          success: result.success,
          result: result.success ? result : undefined,
          error: result.success ? undefined : result.error
        });
      };
    `;
  }

  private fallbackToMainThread(): void {
    this.worker = null;
    // Clear any pending messages
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error('Worker failed, using main thread'));
    });
    this.pendingMessages.clear();
  }

  private sendMessage<T>(type: string, payload: any, timeout = 10000): Promise<T> {
    const id = (++this.messageId).toString();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error(`Worker operation timed out after ${timeout}ms`));
      }, timeout) as unknown as number;

      this.pendingMessages.set(id, { resolve, reject, timeout: timeoutId });

      const message: WorkerMessage = { id, type, payload };

      if (this.worker) {
        this.worker.postMessage(message);
      } else {
        // Fallback to main thread
        this.handleMainThread(message).then(resolve).catch(reject);
      }
    });
  }

  private async handleMainThread(message: WorkerMessage): Promise<any> {
    // Main thread fallback implementations
    switch (message.type) {
      case 'parse':
        return JsonUtils.parseJsonSync(message.payload.text);
      case 'format':
        return JsonUtils.formatJsonSync(message.payload.data, message.payload.indent);
      case 'minify':
        return JsonUtils.minifyJsonSync(message.payload.data);
      case 'validate':
        return JsonUtils.validateJsonSync(message.payload.text);
      case 'jsonpath':
        // Simple fallback - just return empty results for now
        return { success: true, matches: [] };
      default:
        throw new Error('Unknown operation type');
    }
  }

  public async parseJson(text: string): Promise<JsonParseResult> {
    return this.sendMessage('parse', { text });
  }

  public async formatJson(data: any, indent = 2): Promise<FormatResult> {
    return this.sendMessage('format', { data, indent });
  }

  public async minifyJson(data: any): Promise<FormatResult> {
    return this.sendMessage('minify', { data });
  }

  public async validateJson(text: string): Promise<{ valid: boolean; error?: string }> {
    return this.sendMessage('validate', { text });
  }

  public async evaluateJsonPath(data: any, path: string): Promise<any> {
    return this.sendMessage('jsonpath', { data, path });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error('Worker terminated'));
    });
    this.pendingMessages.clear();
  }
}

/**
 * Main JSON utilities class
 */
export class JsonUtils {
  private static workerManager: JsonWorkerManager | null = null;

  /**
   * Get or create worker manager
   */
  private static getWorker(): JsonWorkerManager {
    if (!this.workerManager) {
      this.workerManager = new JsonWorkerManager();
    }
    return this.workerManager;
  }

  /**
   * Safe JSON parsing with size checks
   */
  public static async parseJson(text: string): Promise<JsonParseResult> {
    if (!text || typeof text !== 'string') {
      return { success: false, error: 'Invalid input: text must be a non-empty string' };
    }

    const byteSize = new Blob([text]).size;
    if (byteSize > VIEWER_CONSTANTS.MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large: ${Math.round(byteSize / 1024 / 1024)}MB exceeds ${Math.round(VIEWER_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024)}MB limit`
      };
    }

    const isLargeFile = byteSize > VIEWER_CONSTANTS.LARGE_FILE_THRESHOLD;

    if (isLargeFile) {
      // Use worker for large files
      try {
        const result = await this.getWorker().parseJson(text);
        return { ...result, isLargeFile: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Parse failed' };
      }
    } else {
      // Use main thread for small files
      return this.parseJsonSync(text);
    }
  }

  /**
   * Synchronous JSON parsing (for main thread fallback)
   */
  public static parseJsonSync(text: string): JsonParseResult {
    try {
      const data = JSON.parse(text);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Parse failed'
      };
    }
  }

  /**
   * Format JSON with proper indentation
   */
  public static async formatJson(data: any, indent = 2): Promise<FormatResult> {
    try {
      const result = await this.getWorker().formatJson(data, indent);
      return result;
    } catch (error) {
      return this.formatJsonSync(data, indent);
    }
  }

  /**
   * Synchronous JSON formatting
   */
  public static formatJsonSync(data: any, indent = 2): FormatResult {
    try {
      const formatted = JSON.stringify(data, null, indent);
      return { success: true, formatted };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Format failed'
      };
    }
  }

  /**
   * Minify JSON
   */
  public static async minifyJson(data: any): Promise<FormatResult> {
    try {
      const result = await this.getWorker().minifyJson(data);
      return result;
    } catch (error) {
      return this.minifyJsonSync(data);
    }
  }

  /**
   * Synchronous JSON minification
   */
  public static minifyJsonSync(data: any): FormatResult {
    try {
      const formatted = JSON.stringify(data);
      return { success: true, formatted };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Minify failed'
      };
    }
  }

  /**
   * Validate JSON text
   */
  public static async validateJson(text: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const result = await this.getWorker().validateJson(text);
      return result;
    } catch (error) {
      return this.validateJsonSync(text);
    }
  }

  /**
   * Synchronous JSON validation
   */
  public static validateJsonSync(text: string): { valid: boolean; error?: string } {
    try {
      JSON.parse(text);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON'
      };
    }
  }

  /**
   * Get JSON value type
   */
  public static getValueType(value: any): JsonValueType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string'; // fallback
  }

  /**
   * Build JSON tree from parsed data
   */
  public static buildJsonTree(data: any, maxNodes = VIEWER_CONSTANTS.VIRTUALIZATION_THRESHOLD): JsonNode[] {
    const nodes: JsonNode[] = [];
    let nodeCount = 0;

    const createNode = (
      key: string,
      value: any,
      level: number,
      path: string[],
      parent?: JsonNode
    ): JsonNode | null => {
      if (nodeCount >= maxNodes) {
        return null; // Stop creating nodes if we hit the limit
      }

      const type = this.getValueType(value);
      const id = path.join('.');
      const hasChildren = (type === 'object' || type === 'array') &&
                         value !== null &&
                         Object.keys(value).length > 0;

      const childCount = hasChildren ? Object.keys(value).length : 0;

      const node: JsonNode = {
        id,
        key,
        value,
        type,
        level,
        path: [...path],
        isExpanded: level < 2, // Auto-expand first two levels
        parent,
        hasChildren,
        childCount,
      };

      nodeCount++;

      if (hasChildren && nodeCount < maxNodes) {
        node.children = [];

        if (type === 'object') {
          Object.keys(value).forEach(childKey => {
            const childPath = [...path, childKey];
            const childNode = createNode(childKey, value[childKey], level + 1, childPath, node);
            if (childNode) {
              node.children!.push(childNode);
            }
          });
        } else if (type === 'array') {
          value.forEach((item: any, index: number) => {
            const childPath = [...path, index.toString()];
            const childNode = createNode(`[${index}]`, item, level + 1, childPath, node);
            if (childNode) {
              node.children!.push(childNode);
            }
          });
        }
      }

      return node;
    };

    const rootType = this.getValueType(data);
    if (rootType === 'object' || rootType === 'array') {
      const rootNode = createNode('root', data, 0, ['root']);
      if (rootNode) {
        nodes.push(rootNode);
      }
    } else {
      // Primitive root value
      const rootNode = createNode('', data, 0, ['']);
      if (rootNode) {
        nodes.push(rootNode);
      }
    }

    return nodes;
  }

  /**
   * Get visible nodes from tree based on expansion state
   */
  public static getVisibleNodes(nodes: JsonNode[], expandedNodes: Set<string>): JsonNode[] {
    const visible: JsonNode[] = [];

    const traverse = (node: JsonNode) => {
      visible.push(node);

      if (node.children && expandedNodes.has(node.id)) {
        node.children.forEach(child => traverse(child));
      }
    };

    nodes.forEach(node => traverse(node));
    return visible;
  }

  /**
   * Search within JSON data
   */
  public static searchInNodes(
    nodes: JsonNode[],
    query: string,
    expandedNodes: Set<string>
  ): SearchMatch[] {
    if (!query.trim()) return [];

    const matches: SearchMatch[] = [];
    const queryLower = query.toLowerCase();
    const visibleNodes = this.getVisibleNodes(nodes, expandedNodes);

    visibleNodes.forEach(node => {
      // Search in key
      if (node.key && node.key.toLowerCase().includes(queryLower)) {
        const startIndex = node.key.toLowerCase().indexOf(queryLower);
        matches.push({
          nodeId: node.id,
          path: node.path,
          key: node.key,
          startIndex,
          endIndex: startIndex + query.length,
          isKey: true,
          jsonPath: '$.' + node.path.join('.'),
        });
      }

      // Search in value (for primitive types)
      if (node.type !== 'object' && node.type !== 'array') {
        const valueStr = String(node.value);
        if (valueStr.toLowerCase().includes(queryLower)) {
          const startIndex = valueStr.toLowerCase().indexOf(queryLower);
          matches.push({
            nodeId: node.id,
            path: node.path,
            value: valueStr,
            startIndex,
            endIndex: startIndex + query.length,
            isKey: false,
            jsonPath: '$.' + node.path.join('.'),
          });
        }
      }
    });

    return matches;
  }

  /**
   * Escape HTML entities
   */
  public static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format value for display
   */
  public static formatDisplayValue(value: any, type: JsonValueType): string {
    switch (type) {
      case 'string':
        return `"${this.escapeHtml(value)}"`;
      case 'number':
      case 'boolean':
        return String(value);
      case 'null':
        return 'null';
      case 'object':
        return '{}';
      case 'array':
        return '[]';
      default:
        return String(value);
    }
  }

  /**
   * Copy text to clipboard
   */
  public static async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      } catch {
        return false;
      }
    }
  }

  /**
   * Generate JSONPath for a node
   */
  public static getJsonPath(node: JsonNode): string {
    if (node.path.length === 0) return '$';

    const pathParts = node.path.slice(1); // Skip root
    let jsonPath = '$';

    pathParts.forEach(part => {
      if (/^\d+$/.test(part)) {
        jsonPath += `[${part}]`;
      } else {
        jsonPath += `.${part}`;
      }
    });

    return jsonPath;
  }

  /**
   * Cleanup worker resources
   */
  public static cleanup(): void {
    if (this.workerManager) {
      this.workerManager.terminate();
      this.workerManager = null;
    }
  }
}
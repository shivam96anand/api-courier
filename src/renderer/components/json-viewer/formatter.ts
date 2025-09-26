import { JsonNode } from './types';

export class JsonFormatter {
  public static formatValue(value: any, type: JsonNode['type']): string {
    switch (type) {
      case 'string':
        return `"${this.escapeHtml(value)}"`;
      case 'number':
      case 'boolean':
        return String(value);
      case 'null':
        return 'null';
      default:
        return String(value);
    }
  }

  public static formatValueWithHighlight(
    value: any,
    type: JsonNode['type'],
    nodeLineNumber: number,
    searchQuery: string,
    searchMatches: any[],
    currentSearchIndex: number
  ): string {
    switch (type) {
      case 'string':
        return `"${this.highlightSearchTerm(value, nodeLineNumber, false, searchQuery, searchMatches, currentSearchIndex)}"`;
      case 'number':
      case 'boolean':
        return this.highlightSearchTerm(String(value), nodeLineNumber, false, searchQuery, searchMatches, currentSearchIndex);
      case 'null':
        return this.highlightSearchTerm('null', nodeLineNumber, false, searchQuery, searchMatches, currentSearchIndex);
      default:
        return this.highlightSearchTerm(String(value), nodeLineNumber, false, searchQuery, searchMatches, currentSearchIndex);
    }
  }

  public static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  public static highlightSearchTerm(
    text: string,
    nodeLineNumber?: number,
    isKey: boolean = false,
    searchQuery: string = '',
    searchMatches: any[] = [],
    currentSearchIndex: number = -1
  ): string {
    if (!searchQuery.trim()) {
      return this.escapeHtml(text);
    }

    const query = searchQuery.toLowerCase();
    const lowerText = text.toLowerCase();

    let result = '';
    let lastIndex = 0;
    let index = lowerText.indexOf(query);
    let matchIndexInText = 0;

    while (index !== -1) {
      result += this.escapeHtml(text.substring(lastIndex, index));

      const currentMatch = searchMatches[currentSearchIndex];
      const isCurrentMatch = currentSearchIndex !== -1 &&
                           currentMatch &&
                           currentMatch.node.lineNumber === nodeLineNumber &&
                           currentMatch.startIndex === index &&
                           ((isKey && currentMatch.isKey) || (!isKey && !currentMatch.isKey));

      const highlightClass = isCurrentMatch ? 'search-highlight search-highlight-active' : 'search-highlight';

      const matchText = this.escapeHtml(text.substring(index, index + query.length));
      result += `<span class="${highlightClass}">${matchText}</span>`;

      lastIndex = index + query.length;
      index = lowerText.indexOf(query, lastIndex);
      matchIndexInText++;
    }

    result += this.escapeHtml(text.substring(lastIndex));

    return result;
  }
}
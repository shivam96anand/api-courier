import { JsonNode, SearchMatch } from './types';
import { JsonParser } from './parser';
import { JsonFormatter } from './formatter';

export class JsonSearch {
  private searchMatches: SearchMatch[] = [];
  private currentSearchIndex = -1;
  private searchQuery = '';

  public performSearch(query: string, nodes: JsonNode[]): { matches: SearchMatch[], currentIndex: number } {
    this.searchQuery = query;
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    if (!this.searchQuery.trim()) {
      return { matches: this.searchMatches, currentIndex: this.currentSearchIndex };
    }

    const queryLower = this.searchQuery.toLowerCase();
    const visibleNodes = JsonParser.getVisibleNodes(nodes);

    visibleNodes.forEach(node => {
      if (node.key) {
        const keyLower = node.key.toLowerCase();
        let startIndex = 0;
        let index = keyLower.indexOf(queryLower, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: node.key,
            startIndex: index,
            endIndex: index + queryLower.length,
            isKey: true
          });
          startIndex = index + 1;
          index = keyLower.indexOf(queryLower, startIndex);
        }
      }

      if (node.type !== 'object' && node.type !== 'array') {
        const valueStr = JsonFormatter.formatValue(node.value, node.type);
        const valueLower = valueStr.toLowerCase();
        let startIndex = 0;
        let index = valueLower.indexOf(queryLower, startIndex);

        while (index !== -1) {
          this.searchMatches.push({
            node,
            lineNumber: node.lineNumber,
            text: valueStr,
            startIndex: index,
            endIndex: index + queryLower.length,
            isKey: false
          });
          startIndex = index + 1;
          index = valueLower.indexOf(queryLower, startIndex);
        }
      }
    });

    this.currentSearchIndex = this.searchMatches.length > 0 ? 0 : -1;
    return { matches: this.searchMatches, currentIndex: this.currentSearchIndex };
  }

  public navigateSearch(direction: number): { matches: SearchMatch[], currentIndex: number } {
    if (this.searchMatches.length === 0) {
      return { matches: this.searchMatches, currentIndex: this.currentSearchIndex };
    }

    if (direction === 1) {
      this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchMatches.length;
    } else {
      this.currentSearchIndex = this.currentSearchIndex <= 0 ? this.searchMatches.length - 1 : this.currentSearchIndex - 1;
    }

    return { matches: this.searchMatches, currentIndex: this.currentSearchIndex };
  }

  public clearSearch(): { matches: SearchMatch[], currentIndex: number } {
    this.searchQuery = '';
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    return { matches: this.searchMatches, currentIndex: this.currentSearchIndex };
  }

  public getCurrentMatch(): SearchMatch | null {
    if (this.currentSearchIndex === -1 || !this.searchMatches[this.currentSearchIndex]) {
      return null;
    }
    return this.searchMatches[this.currentSearchIndex];
  }

  public getSearchInfo(): { total: number, current: number } {
    return {
      total: this.searchMatches.length,
      current: this.currentSearchIndex === -1 ? 0 : this.currentSearchIndex + 1
    };
  }

  public getSearchQuery(): string {
    return this.searchQuery;
  }

  public getMatches(): SearchMatch[] {
    return this.searchMatches;
  }

  public getCurrentIndex(): number {
    return this.currentSearchIndex;
  }
}
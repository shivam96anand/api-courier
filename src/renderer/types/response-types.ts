import { ApiResponse } from '../../shared/types';

export interface ResponseState {
  currentResponse: ApiResponse | null;
  activeTab: string;
  searchQuery: string;
  viewPreferences: Record<string, any>;
  isFloatingSearchVisible: boolean;
}

export interface ResponseManagerConfig {
  viewerConfig: ResponseViewerConfig;
  tabsConfig: ResponseTabsConfig;
  exportConfig: ResponseExportConfig;
  searchConfig: ResponseSearchConfig;
}

export interface ResponseViewerConfig {
  prettyConfig: PrettyFormatterConfig;
  rawConfig: RawFormatterConfig;
  headersConfig: HeadersFormatterConfig;
}

export interface ResponseTabsConfig {
  defaultTab: string;
  enabledTabs: string[];
}

export interface ResponseExportConfig {
  defaultFormat: string;
  enabledFormats: string[];
}

export interface ResponseSearchConfig {
  caseSensitive: boolean;
  regex: boolean;
}

export interface PrettyFormatterConfig {
  maxDepth?: number;
  collapseThreshold?: number;
}

export interface RawFormatterConfig {
  wrapLines: boolean;
  fontSize: number;
}

export interface HeadersFormatterConfig {
  showSize: boolean;
  groupByType: boolean;
}

export interface FormattersManager {
  pretty: PrettyFormatter;
  raw: RawFormatter;
  headers: HeadersFormatter;
}

export interface PrettyFormatter {
  format(response: ApiResponse): void;
  show(): void;
  hide(): void;
  search(query: string): void;
  clear(): void;
  destroy(): void;
}

export interface RawFormatter {
  format(response: ApiResponse): void;
  show(): void;
  hide(): void;
  search(query: string): void;
  clear(): void;
  destroy(): void;
}

export interface HeadersFormatter {
  format(response: ApiResponse): void;
  show(): void;
  hide(): void;
  search(query: string): void;
  clear(): void;
  destroy(): void;
}
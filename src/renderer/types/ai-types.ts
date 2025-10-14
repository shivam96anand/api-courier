export interface AiMessage {
  id: string;
  type: 'user' | 'ai' | 'error' | 'system';
  content: string;
  timestamp: number;
}

export interface AiContext {
  currentRequest?: any;
  lastResponse?: any;
  environment?: any;
  collection?: any;
  requestCtx?: any;
  responseCtx?: any;
}

export interface AiPrompt {
  id: string;
  title: string;
  content: string;
  category?: string;
}

export interface AiTabConfig {
  chatConfig: AiChatConfig;
  promptConfig: AiPromptConfig;
  responseConfig: AiResponseConfig;
  contextConfig: AiContextConfig;
  aiService: AiService;
}

export interface AiChatConfig {
  maxMessages: number;
  enableMarkdown: boolean;
  enableStreaming: boolean;
  autoScroll: boolean;
}

export interface AiPromptConfig {
  enableCustomPrompts: boolean;
  maxPrompts: number;
  suggestionsEnabled: boolean;
}

export interface AiResponseConfig {
  streamingEnabled: boolean;
  maxResponseLength: number;
  enableCodeHighlighting: boolean;
}

export interface AiContextConfig {
  includeRequestData: boolean;
  includeResponseData: boolean;
  maxContextSize: number;
  autoRefreshContext: boolean;
}

export interface AiService {
  sendRequest(prompt: string, context?: AiContext): Promise<AiResponse>;
  isAvailable(): Promise<boolean>;
  getStatus(): Promise<AiServiceStatus>;
}

export interface AiResponse {
  content: string;
  success: boolean;
  error?: string;
  metadata?: any;
}

export interface AiServiceStatus {
  isRunning: boolean;
  version?: string;
  model?: string;
  error?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  requestCtx: any;
  responseCtx: any;
  createdAt: Date;
  updatedAt: Date;
  systemPrompt?: string;
  contextMessage?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: Date;
}

export interface EngineStatus {
  isRunning: boolean;
  error?: string;
  version?: string;
}

export interface SessionManager {
  createSession(requestCtx: any, responseCtx: any): AiSession;
  getSession(id: string): AiSession | null;
  getAllSessions(): AiSession[];
  deleteSession(id: string): void;
  clearAllSessions(): void;
  searchSessions(query: string): SessionSummary[];
}
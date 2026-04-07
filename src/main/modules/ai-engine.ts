import { app, net } from 'electron';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import {
  AiSession,
  AiMessage,
  AiContext,
  AiSendMessageParams,
  AiSendMessageResult,
  AiSessionsState,
  AI_MAX_CONTEXT_CHARS,
  ApiRequest,
  ApiResponse,
} from '../../shared/types';
import { AI_SYSTEM_PROMPT } from './ai-system-prompt';
import { randomUUID } from 'crypto';

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://localhost:9999';
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen2.5-7b-instruct';

class AiEngine {
  private sessionsPath: string;
  private sessions: AiSession[] = [];
  private writeQueue: NodeJS.Timeout | null = null;

  constructor() {
    const aiDataDir = join(app.getPath('userData'), 'ai-data');
    if (!existsSync(aiDataDir)) {
      mkdirSync(aiDataDir, { recursive: true });
    }
    this.sessionsPath = join(aiDataDir, 'sessions.json');
  }

  async initialize(): Promise<void> {
    if (existsSync(this.sessionsPath)) {
      try {
        const content = await readFile(this.sessionsPath, 'utf-8');
        this.sessions = JSON.parse(content);
      } catch (error) {
        console.error('Failed to load AI sessions:', error);
        this.sessions = [];
      }
    }
  }

  getSessions(): AiSessionsState {
    return {
      sessions: this.sessions.map(s => ({
        ...s,
        // Return lightweight version without full message content for list
        messages: s.messages.map(m => ({ ...m })),
      })),
    };
  }

  createSession(context?: AiContext): AiSession {
    const now = Date.now();
    const session: AiSession = {
      id: randomUUID(),
      title: this.generateSessionTitle(context),
      messages: [],
      context,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.unshift(session);
    this.queueWrite();
    return session;
  }

  deleteSession(sessionId: string): boolean {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      this.sessions.splice(index, 1);
      this.queueWrite();
      return true;
    }
    return false;
  }

  updateSession(sessionId: string, updates: Partial<Pick<AiSession, 'title' | 'context'>>): AiSession | null {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      if (updates.title !== undefined) session.title = updates.title;
      if (updates.context !== undefined) session.context = updates.context;
      session.updatedAt = Date.now();
      this.queueWrite();
      return session;
    }
    return null;
  }

  async sendMessage(params: AiSendMessageParams, streamCallback?: (chunk: string) => void): Promise<AiSendMessageResult> {
    const { sessionId, message, context } = params;

    let session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Update context if provided
    if (context) {
      session.context = context;
    }

    // Check context size limit
    const contextSize = this.calculateContextSize(session.context);
    if (contextSize > AI_MAX_CONTEXT_CHARS) {
      return {
        success: false,
        error: `Content too large (${Math.round(contextSize / 1000)}K chars). Maximum allowed: ${AI_MAX_CONTEXT_CHARS / 1000}K chars. Try with a smaller response or file.`,
        tokenLimitExceeded: true,
      };
    }

    // Add user message
    const userMessage: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    session.messages.push(userMessage);
    session.updatedAt = Date.now();

    // Build messages for LLM
    const llmMessages = this.buildLlmMessages(session);

    try {
      const response = streamCallback
        ? await this.callLlmStreaming(llmMessages, streamCallback)
        : await this.callLlm(llmMessages);

      const assistantMessage: AiMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      session.messages.push(assistantMessage);
      session.updatedAt = Date.now();

      // Update title if this is the first exchange
      if (session.messages.length === 2 && session.title.startsWith('New Chat')) {
        session.title = this.generateTitleFromMessage(message);
      }

      this.queueWrite();

      return { success: true, message: assistantMessage };
    } catch (error) {
      // Remove the user message if LLM call failed
      session.messages.pop();

      const errorMsg = error instanceof Error ? error.message : 'Failed to get AI response';
      return { success: false, error: errorMsg };
    }
  }

  async checkEngine(): Promise<{ available: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await net.fetch(`${LLM_BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return { available: true };
      }
      
      // Some servers don't have /health, try a simple completion
      return await this.checkWithCompletion();
    } catch {
      // Try completion endpoint as fallback
      return await this.checkWithCompletion();
    }
  }

  private async checkWithCompletion(): Promise<{ available: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await net.fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { available: true };
      }
      return { available: false, error: `Server returned ${response.status}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      return { available: false, error: msg };
    }
  }

  private buildLlmMessages(session: AiSession): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // System prompt
    messages.push({ role: 'system', content: AI_SYSTEM_PROMPT });

    // Add context as system message if available
    if (session.context) {
      const contextContent = this.formatContext(session.context);
      if (contextContent) {
        messages.push({ role: 'system', content: contextContent });
      }
    }

    // Add conversation history
    for (const msg of session.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    return messages;
  }

  private formatContext(context: AiContext): string {
    const parts: string[] = [];

    if (context.request) {
      parts.push(this.formatRequest(context.request));
    }

    if (context.response) {
      parts.push(this.formatResponse(context.response));
    }

    if (context.fileContent) {
      const fileName = context.fileName || 'uploaded file';
      parts.push(`--- Uploaded File: ${fileName} ---\n${context.fileContent}`);
    }

    return parts.join('\n\n');
  }

  private formatRequest(req: ApiRequest): string {
    const lines: string[] = ['--- API Request ---'];
    lines.push(`${req.method} ${req.url}`);

    // Only include body for context, skip headers to reduce size
    if (req.body && req.body.type !== 'none' && req.body.content) {
      lines.push(`Request Body (${req.body.type}):`);
      lines.push(req.body.content);
    }

    return lines.join('\n');
  }

  private formatResponse(res: ApiResponse): string {
    const lines: string[] = ['--- API Response ---'];
    lines.push(`Status: ${res.status} ${res.statusText} | Time: ${res.time}ms`);

    // Only include content-type header as it's most relevant
    const contentType = res.headers?.['content-type'] || res.headers?.['Content-Type'];
    if (contentType) {
      lines.push(`Content-Type: ${contentType}`);
    }

    if (res.body) {
      lines.push('Body:');
      lines.push(res.body);
    }

    return lines.join('\n');
  }

  private calculateContextSize(context?: AiContext): number {
    if (!context) return 0;
    
    let size = 0;
    if (context.request) {
      size += JSON.stringify(context.request).length;
    }
    if (context.response) {
      size += (context.response.body?.length || 0) + JSON.stringify(context.response.headers).length + 200;
    }
    if (context.fileContent) {
      size += context.fileContent.length;
    }
    return size;
  }

  private async callLlm(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await net.fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || 'No response from AI';
  }

  private async callLlmStreaming(
    messages: Array<{ role: string; content: string }>,
    streamCallback: (chunk: string) => void
  ): Promise<string> {
    const response = await net.fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM request failed: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const data = JSON.parse(jsonStr) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                streamCallback(content);
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent || 'No response from AI';
  }

  private generateSessionTitle(context?: AiContext): string {
    if (context?.request) {
      const method = context.request.method;
      const url = context.request.url;
      // Extract path from URL
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname.slice(0, 30);
        return `${method} ${path}${urlObj.pathname.length > 30 ? '...' : ''}`;
      } catch {
        return `${method} Request`;
      }
    }
    if (context?.fileName) {
      return `File: ${context.fileName.slice(0, 25)}`;
    }
    return 'New Chat';
  }

  private generateTitleFromMessage(message: string): string {
    // Take first 40 chars of the message as title
    const cleaned = message.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 40) return cleaned;
    return cleaned.slice(0, 37) + '...';
  }

  private queueWrite(): void {
    if (this.writeQueue) {
      clearTimeout(this.writeQueue);
    }
    this.writeQueue = setTimeout(() => {
      this.writeToFile();
      this.writeQueue = null;
    }, 500);
  }

  private writeToFile(): void {
    try {
      writeFileSync(this.sessionsPath, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to write AI sessions:', error);
    }
  }

  async flush(): Promise<void> {
    if (this.writeQueue) {
      clearTimeout(this.writeQueue);
      this.writeQueue = null;
    }
    this.writeToFile();
  }
}

export const aiEngine = new AiEngine();

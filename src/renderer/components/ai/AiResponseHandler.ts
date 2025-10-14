import { AiResponse, AiResponseConfig, AiMessage } from '../../types/ai-types';
import { AiChatInterface } from './AiChatInterface';

export class AiResponseHandler {
  constructor(private config: AiResponseConfig) {}

  public async handleResponse(response: AiResponse, chatInterface: AiChatInterface): Promise<void> {
    if (response.success && response.content) {
      await this.handleSuccessResponse(response, chatInterface);
    } else {
      this.handleErrorResponse(response, chatInterface);
    }
  }

  private async handleSuccessResponse(response: AiResponse, chatInterface: AiChatInterface): Promise<void> {
    if (this.config.streamingEnabled && this.config.enableCodeHighlighting) {
      await this.streamResponse(response.content, chatInterface);
    } else {
      this.addCompleteResponse(response.content, chatInterface);
    }
  }

  private handleErrorResponse(response: AiResponse, chatInterface: AiChatInterface): void {
    const errorMessage: AiMessage = {
      id: this.generateId(),
      type: 'error',
      content: response.error || 'An error occurred while processing your request.',
      timestamp: Date.now()
    };
    
    chatInterface.addMessage(errorMessage);
  }

  private async streamResponse(content: string, chatInterface: AiChatInterface): Promise<void> {
    // Simulate streaming by showing content progressively
    const chunks = this.chunkContent(content);
    let accumulatedContent = '';

    for (let i = 0; i < chunks.length; i++) {
      accumulatedContent += chunks[i];
      
      // Update or create the message
      if (i === 0) {
        const message: AiMessage = {
          id: this.generateId(),
          type: 'ai',
          content: accumulatedContent,
          timestamp: Date.now()
        };
        chatInterface.addMessage(message);
      } else {
        // In a real implementation, we would update the existing message
        // For now, we'll just add the complete message at the end
      }

      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Add the final complete message
    this.addCompleteResponse(content, chatInterface);
  }

  private addCompleteResponse(content: string, chatInterface: AiChatInterface): void {
    // Truncate if too long
    let finalContent = content;
    if (content.length > this.config.maxResponseLength) {
      finalContent = content.substring(0, this.config.maxResponseLength) + '\n\n... [Response truncated]';
    }

    const message: AiMessage = {
      id: this.generateId(),
      type: 'ai',
      content: finalContent,
      timestamp: Date.now()
    };

    chatInterface.addMessage(message);
  }

  private chunkContent(content: string): string[] {
    const chunkSize = 50; // Characters per chunk
    const chunks: string[] = [];
    
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize));
    }
    
    return chunks;
  }

  public formatCodeBlocks(content: string): string {
    if (!this.config.enableCodeHighlighting) {
      return content;
    }

    // Enhanced code block formatting
    return content.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<div class="code-block-wrapper"><pre class="code-block language-$1"><code>$2</code></pre></div>'
    );
  }

  public validateResponse(response: AiResponse): boolean {
    if (!response) {
      return false;
    }

    if (!response.success && !response.error) {
      return false;
    }

    if (response.success && !response.content) {
      return false;
    }

    return true;
  }

  public sanitizeContent(content: string): string {
    // Remove potentially harmful content
    let sanitized = content;

    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove on* event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:[^"']*/gi, '');

    return sanitized;
  }

  private generateId(): string {
    return `ai_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public destroy(): void {
    // Cleanup if needed
  }
}
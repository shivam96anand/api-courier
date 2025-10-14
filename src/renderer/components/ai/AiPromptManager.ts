import { AiPrompt, AiPromptConfig, AiContext } from '../../types/ai-types';

export class AiPromptManager {
  private prompts: AiPrompt[] = [];
  private onPromptSelectCallback: ((prompt: string) => void) | null = null;

  constructor(private config: AiPromptConfig) {
    this.initializePrompts();
  }

  private initializePrompts(): void {
    this.prompts = [
      {
        id: 'debug-request',
        title: 'Debug this request',
        content: 'Can you help me debug this API request? What might be going wrong?',
        category: 'debugging'
      },
      {
        id: 'optimize-request',
        title: 'Optimize request',
        content: 'How can I optimize this API request for better performance?',
        category: 'optimization'
      },
      {
        id: 'security-check',
        title: 'Security check',
        content: 'Are there any security concerns with this API request?',
        category: 'security'
      },
      {
        id: 'generate-tests',
        title: 'Generate tests',
        content: 'Can you generate test cases for this API endpoint?',
        category: 'testing'
      },
      {
        id: 'explain-response',
        title: 'Explain response',
        content: 'Can you explain what this API response means?',
        category: 'explanation'
      },
      {
        id: 'analyze-error',
        title: 'Analyze error',
        content: 'This request failed. Can you help me understand why?',
        category: 'debugging'
      },
      {
        id: 'improve-request',
        title: 'Improve this request',
        content: 'How can I improve this API request structure?',
        category: 'optimization'
      }
    ];
  }

  public getPrompts(): AiPrompt[] {
    return [...this.prompts];
  }

  public getPromptsByCategory(category: string): AiPrompt[] {
    return this.prompts.filter(prompt => prompt.category === category);
  }

  public getPrompt(id: string): AiPrompt | undefined {
    return this.prompts.find(prompt => prompt.id === id);
  }

  public addCustomPrompt(prompt: AiPrompt): void {
    if (this.config.enableCustomPrompts && this.prompts.length < this.config.maxPrompts) {
      this.prompts.push(prompt);
    }
  }

  public removePrompt(id: string): void {
    this.prompts = this.prompts.filter(prompt => prompt.id !== id);
  }

  public buildPrompt(userMessage: string, context: AiContext): string {
    let prompt = userMessage;

    // Add context information to the prompt
    if (context.requestCtx) {
      prompt += `\n\nCurrent request context:\n`;
      prompt += `Method: ${context.requestCtx.method}\n`;
      prompt += `URL: ${context.requestCtx.url}\n`;
      
      if (context.requestCtx.headers && Object.keys(context.requestCtx.headers).length > 0) {
        prompt += `Headers: ${JSON.stringify(context.requestCtx.headers, null, 2)}\n`;
      }
      
      if (context.requestCtx.body) {
        const bodyPreview = typeof context.requestCtx.body === 'string' 
          ? context.requestCtx.body.substring(0, 1000)
          : JSON.stringify(context.requestCtx.body).substring(0, 1000);
        prompt += `Body: ${bodyPreview}\n`;
      }
    }

    if (context.responseCtx) {
      prompt += `\n\nLast response:\n`;
      prompt += `Status: ${context.responseCtx.status}\n`;
      prompt += `Time: ${context.responseCtx.time}ms\n`;
      prompt += `Size: ${context.responseCtx.size} bytes\n`;
      
      if (context.responseCtx.headers && Object.keys(context.responseCtx.headers).length > 0) {
        prompt += `Headers: ${JSON.stringify(context.responseCtx.headers, null, 2)}\n`;
      }
      
      if (context.responseCtx.body) {
        const bodyPreview = typeof context.responseCtx.body === 'string' 
          ? context.responseCtx.body.substring(0, 1000)
          : JSON.stringify(context.responseCtx.body).substring(0, 1000);
        prompt += `Body preview: ${bodyPreview}\n`;
      }
    }

    return prompt;
  }

  public getContextualSuggestions(responseStatus?: number, responseSize?: number, responseTime?: number): string[] {
    const suggestions: string[] = [];

    // Base suggestions
    suggestions.push('Explain this response');
    suggestions.push('What does this data mean?');

    // Status-based suggestions
    if (responseStatus) {
      if (responseStatus >= 400) {
        suggestions.push('Why did this request fail?');
        suggestions.push('How can I fix this error?');
      } else if (responseStatus >= 200 && responseStatus < 300) {
        suggestions.push('Is this response correct?');
        suggestions.push('How can I use this data?');
      }
    }

    // Performance-based suggestions
    if (responseTime && responseTime > 2000) {
      suggestions.push('Why is this request slow?');
      suggestions.push('How can I optimize this?');
    }

    // Size-based suggestions
    if (responseSize && responseSize > 1048576) { // > 1MB
      suggestions.push('This response is large, is that normal?');
      suggestions.push('Can I paginate this data?');
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  public onPromptSelect(callback: (prompt: string) => void): void {
    this.onPromptSelectCallback = callback;
  }

  public selectPrompt(id: string): void {
    const prompt = this.getPrompt(id);
    if (prompt && this.onPromptSelectCallback) {
      this.onPromptSelectCallback(prompt.content);
    }
  }

  public destroy(): void {
    this.onPromptSelectCallback = null;
  }
}
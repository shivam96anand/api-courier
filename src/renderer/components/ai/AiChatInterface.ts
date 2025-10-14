import { AiMessage, AiChatConfig, ChatMessage } from '../../types/ai-types';

export class AiChatInterface {
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private messages: AiMessage[] = [];
  private onMessageSendCallback: ((message: string) => void) | null = null;
  private onClearChatCallback: (() => void) | null = null;

  constructor(private container: HTMLElement, private config: AiChatConfig) {
    this.createInterface();
    this.setupEventListeners();
  }

  private createInterface(): void {
    // Create chat messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'ai-messages';
    this.messagesContainer.id = 'chat-messages';
    this.container.appendChild(this.messagesContainer);

    // Create input container
    this.inputContainer = document.createElement('div');
    this.inputContainer.className = 'input-area';
    this.inputContainer.id = 'input-area';
    this.inputContainer.style.display = 'none';
    
    // Create input elements
    this.inputElement = document.createElement('textarea');
    this.inputElement.id = 'message-input';
    this.inputElement.className = 'ai-input';
    this.inputElement.placeholder = 'Ask about this response...';
    this.inputElement.rows = 3;

    this.sendButton = document.createElement('button');
    this.sendButton.id = 'btn-send';
    this.sendButton.className = 'btn-send';
    this.sendButton.innerHTML = '<span class="icon">✈️</span><span class="label">Send</span>';
    this.sendButton.disabled = true;

    const inputActionsDiv = document.createElement('div');
    inputActionsDiv.className = 'input-actions';
    inputActionsDiv.appendChild(this.sendButton);

    const inputContainerDiv = document.createElement('div');
    inputContainerDiv.className = 'input-container';
    inputContainerDiv.appendChild(this.inputElement);
    inputContainerDiv.appendChild(inputActionsDiv);

    const inputHelpDiv = document.createElement('div');
    inputHelpDiv.className = 'input-help';
    inputHelpDiv.innerHTML = '<kbd>Enter</kbd> to send • <kbd>Shift+Enter</kbd> for new line • <kbd>Ctrl+K</kbd> to focus';

    this.inputContainer.appendChild(inputContainerDiv);
    this.inputContainer.appendChild(inputHelpDiv);
    this.container.appendChild(this.inputContainer);
  }

  private setupEventListeners(): void {
    if (!this.sendButton || !this.inputElement) return;

    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.inputElement.addEventListener('input', () => {
      if (this.sendButton && this.inputElement) {
        this.sendButton.disabled = !this.inputElement.value.trim();
      }
    });
  }

  private sendMessage(): void {
    if (!this.inputElement) return;

    const message = this.inputElement.value.trim();
    if (message && this.onMessageSendCallback) {
      this.onMessageSendCallback(message);
      this.inputElement.value = '';
      this.updateSendButton();
    }
  }

  public addMessage(message: AiMessage): void {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  private renderMessage(message: AiMessage): void {
    if (!this.messagesContainer) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.type}`;
    messageElement.innerHTML = this.formatMessageContent(message);
    this.messagesContainer.appendChild(messageElement);
  }

  private formatMessageContent(message: AiMessage): string {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const typeLabel = message.type === 'user' ? 'You' : 'AI';
    
    let content = this.escapeHtml(message.content);
    
    if (this.config.enableMarkdown) {
      content = this.formatMarkdown(content);
    }
    
    return `
      <div class="message-content">
        <div class="message-text">${content}</div>
      </div>
    `;
  }

  private formatMarkdown(content: string): string {
    // Basic markdown formatting
    let formatted = content;

    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="code-block"><code>$2</code></pre>');

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  public clearMessages(): void {
    this.messages = [];
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }
  }

  public setInputValue(value: string): void {
    if (this.inputElement) {
      this.inputElement.value = value;
      this.updateSendButton();
      this.inputElement.focus();
    }
  }

  public setProcessing(processing: boolean): void {
    if (this.sendButton && this.inputElement) {
      this.sendButton.disabled = processing || !this.inputElement.value.trim();
      const label = this.sendButton.querySelector('.label');
      if (label) {
        label.textContent = processing ? 'Processing...' : 'Send';
      }
      this.inputElement.disabled = processing;
    }
  }

  public showInputArea(): void {
    if (this.inputContainer) {
      this.inputContainer.style.display = 'block';
    }
  }

  public hideInputArea(): void {
    if (this.inputContainer) {
      this.inputContainer.style.display = 'none';
    }
  }

  private updateSendButton(): void {
    if (this.sendButton && this.inputElement) {
      this.sendButton.disabled = !this.inputElement.value.trim();
    }
  }

  public focus(): void {
    this.inputElement?.focus();
  }

  public onMessageSend(callback: (message: string) => void): void {
    this.onMessageSendCallback = callback;
  }

  public onClearChat(callback: () => void): void {
    this.onClearChatCallback = callback;
  }

  public render(): void {
    // Interface is created in constructor
  }

  public showTypingIndicator(): void {
    if (!this.messagesContainer) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = `
      <div class="message-content">
        <span class="typing-text">AI is thinking</span>
        <div class="typing-dots">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(typingDiv);
    this.scrollToBottom();
  }

  public hideTypingIndicator(): void {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  public destroy(): void {
    this.container.innerHTML = '';
    this.onMessageSendCallback = null;
    this.onClearChatCallback = null;
  }
}
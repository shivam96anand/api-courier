import { ApiRequest, ApiResponse } from '../shared/types';
import { AI_PROMPTS, buildContextMessage } from './prompts';

// Configuration
export const AI_CONFIG = {
  LLM_URL: 'http://127.0.0.1:8080/v1/chat/completions',
  DEFAULT_MODEL: 'qwen2.5-7b',
  DEFAULT_TEMPERATURE: 0.2,
  DEFAULT_MAX_TOKENS: 2048,
  MAX_CONTEXT_SIZE: 120000, // 120KB limit for request/response bodies
  MAX_TOKENS_FOR_CONTEXT: 2500, // Reserve tokens for context (4096 total - 1500 for response = 2500)
};

// Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface RequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  body?: string;
  bodyType?: string;
}

export interface ResponseContext {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

export interface FirstTurnResult {
  system: string;
  user: string;
}

export interface ChatResult {
  success: boolean;
  content?: string;
  error?: string;
}

// Import system prompt from prompts file
const SYSTEM_PROMPT = AI_PROMPTS.SYSTEM_PROMPT;

/**
 * Masks sensitive information in strings or objects
 */
export function maskSecrets(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/authorization:\s*[^\r\n,}]+/gi, 'authorization: [MASKED]')
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'bearer [MASKED]')
      .replace(/token['":\s]*[a-zA-Z0-9._-]+/gi, 'token: [MASKED]')
      .replace(/password['":\s]*[^\r\n,}]+/gi, 'password: [MASKED]')
      .replace(/secret['":\s]*[^\r\n,}]+/gi, 'secret: [MASKED]')
      .replace(/key['":\s]*[a-zA-Z0-9._-]{16,}/gi, 'key: [MASKED]');
  }

  if (typeof input === 'object' && input !== null) {
    const masked = { ...input };
    for (const [key, value] of Object.entries(masked)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('auth') || lowerKey.includes('token') ||
          lowerKey.includes('password') || lowerKey.includes('secret') ||
          lowerKey.includes('key')) {
        masked[key] = '[MASKED]';
      } else if (typeof value === 'string') {
        masked[key] = maskSecrets(value);
      }
    }
    return masked;
  }

  return input;
}

/**
 * More accurate token count estimation (3 chars ≈ 1 token for JSON content)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Summarizes large JSON by truncating content but preserving structure
 * Now with token-aware truncation for LLM context limits
 */
export function summarizeLargeJson(value: any, maxTokens: number = 1000): string {
  const fullString = JSON.stringify(value, null, 2);

  // If content is small enough, return as-is
  if (estimateTokenCount(fullString) <= maxTokens) {
    return fullString;
  }

  // For large content, create an intelligent summary
  if (Array.isArray(value)) {
    const itemTypes = new Set();
    // Show more items for small arrays, fewer for large ones
    const sampleSize = value.length <= 5 ? value.length : Math.min(3, value.length);
    const firstFewItems = value.slice(0, sampleSize);

    // Analyze item types in the array
    firstFewItems.forEach(item => {
      if (item === null) itemTypes.add('null');
      else if (Array.isArray(item)) itemTypes.add('array');
      else if (typeof item === 'object') {
        const keys = Object.keys(item).slice(0, 5).join(', ');
        itemTypes.add(`object{${keys}${Object.keys(item).length > 5 ? '...' : ''}}`);
      } else itemTypes.add(typeof item);
    });

    // Try to include actual sample items first
    const detailedSample = firstFewItems.map(item => {
      if (typeof item === 'object' && item !== null) {
        return summarizeLargeJson(item, Math.max(300, maxTokens / 3));
      }
      return item;
    });

    // Instead of adding metadata fields, just return the sample items directly
    // with a comment at the end indicating truncation
    const summary = detailedSample;

    const summaryString = JSON.stringify(summary, null, 2);
    if (estimateTokenCount(summaryString) <= maxTokens) {
      return summaryString;
    }

    // If still too large, truncate to just first few items
    const simpleSample = value.slice(0, Math.min(2, value.length));
    return JSON.stringify(simpleSample, null, 2) +
           `\n/* Array truncated: showing 2 of ${value.length} items */`;
  }

  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    const result: any = {};

    // List of important keys that should always be preserved completely
    const importantKeys = ['status', 'productCharacteristic', 'realizingResource', 'productRelationship', 'productPrice', 'productOrderItem'];

    // Sort keys to prioritize important ones
    const sortedKeys = keys.sort((a, b) => {
      const aImportant = importantKeys.includes(a);
      const bImportant = importantKeys.includes(b);
      if (aImportant && !bImportant) return -1;
      if (!aImportant && bImportant) return 1;
      return 0;
    });

    // Try to include actual content for each key
    let currentTokens = 0;
    const maxKeysToShow = Math.min(20, sortedKeys.length); // Show even more keys

    for (let i = 0; i < maxKeysToShow; i++) {
      const key = sortedKeys[i];
      let val = value[key];

      // For important keys, give them much more generous token budget
      const isImportantKey = importantKeys.includes(key);

      // Recursively summarize nested content with generous token budget
      if (typeof val === 'object' && val !== null) {
        const remainingTokens = isImportantKey ?
          Math.max(1000, maxTokens / 2) : // Important keys get much more space
          Math.max(400, (maxTokens - currentTokens) / (maxKeysToShow - i));
        val = summarizeLargeJson(val, remainingTokens);
      }

      // Don't truncate strings as aggressively, especially for important keys
      const maxStringLength = isImportantKey ? 1000 : 500;
      const truncatedVal = typeof val === 'string' && val.length > maxStringLength ?
        val.substring(0, maxStringLength) + '... [truncated]' : val;

      // Test if adding this key would exceed limits (but be more lenient for important keys)
      const testResult = { ...result, [key]: truncatedVal };
      const testTokens = estimateTokenCount(JSON.stringify(testResult, null, 2));

      if (testTokens > maxTokens && !isImportantKey) {
        // Stop here for non-important keys only
        break;
      }

      result[key] = truncatedVal;
      currentTokens = testTokens;
    }

    return JSON.stringify(result, null, 2);
  }

  // For primitives, truncate to fit token limit
  const maxChars = maxTokens * 4; // Rough conversion
  return fullString.length > maxChars ?
    fullString.substring(0, maxChars) + '... [truncated]' :
    fullString;
}

/**
 * Builds the first turn for a new AI session with token-aware content limits
 */
export function buildFirstTurn(requestCtx: RequestContext, responseCtx: ResponseContext): FirstTurnResult {
  // Budget tokens carefully (targeting ~2500 tokens for context, leaving room for response)
  const MAX_CONTEXT_TOKENS = 2500;

  // Create concise request summary
  const requestSummary = `${requestCtx.method} ${requestCtx.url}`;

  // Get key headers (excluding verbose ones)
  const importantHeaders = ['content-type', 'authorization', 'accept', 'user-agent'];
  const keyHeaders: Record<string, string> = {};
  Object.entries(requestCtx.headers || {}).forEach(([key, value]) => {
    if (importantHeaders.includes(key.toLowerCase())) {
      keyHeaders[key] = maskSecrets(value);
    }
  });

  // Summarize response body with intelligent truncation
  let responseBodySummary = 'No response body';
  let responseSizeInfo = '';

  if (responseCtx.body) {
    const originalSize = responseCtx.body.length;
    responseSizeInfo = ` (Original: ${originalSize} chars)`;

    try {
      const parsed = JSON.parse(responseCtx.body);

      // For smaller responses (under 20KB), try sending complete JSON
      if (originalSize < 20000) {
        const completeJson = JSON.stringify(parsed, null, 2);
        // Check if complete JSON fits in our token budget
        if (estimateTokenCount(completeJson) <= 1800) {
          responseBodySummary = completeJson;
        } else {
          // Even small response is too many tokens, summarize it
          responseBodySummary = summarizeLargeJson(parsed, 1800);
        }
      } else {
        // Larger responses need summarization
        responseBodySummary = summarizeLargeJson(parsed, 1800);
        responseBodySummary += `\n\n📊 LARGE RESPONSE DETECTED (${Math.round(originalSize/1000)}KB)
- Response was summarized due to size
- Ask about specific sections for complete details`;
      }
    } catch {
      // Not JSON, truncate but preserve more for large responses
      const maxLength = originalSize > 10000 ? 500 : 200; // More chars for big responses
      responseBodySummary = responseCtx.body.length > maxLength ?
        responseCtx.body.substring(0, maxLength) + `... [truncated from ${originalSize} chars]` :
        responseCtx.body;
    }
  }

  // Build concise context message
  const contextParts = [
    `REQUEST: ${requestSummary}`,
    `STATUS: ${responseCtx.status} ${responseCtx.statusText} (${responseCtx.time}ms, ${responseCtx.size} bytes)`,
  ];

  // Add headers if they exist and aren't too verbose
  if (Object.keys(keyHeaders).length > 0) {
    const headersStr = JSON.stringify(keyHeaders);
    if (estimateTokenCount(headersStr) < 100) {
      contextParts.push(`HEADERS: ${headersStr}`);
    }
  }

  // Add params if they exist
  if (requestCtx.params && Object.keys(requestCtx.params).length > 0) {
    const paramsStr = JSON.stringify(requestCtx.params);
    if (estimateTokenCount(paramsStr) < 100) {
      contextParts.push(`PARAMS: ${paramsStr}`);
    }
  }

  // Add request body if it exists and is small
  if (requestCtx.body) {
    const maskedBody = maskSecrets(requestCtx.body);
    if (maskedBody.length < 200) {
      contextParts.push(`REQUEST_BODY: ${maskedBody}`);
    } else {
      contextParts.push(`REQUEST_BODY: ${requestCtx.bodyType} (${maskedBody.length} chars, truncated)`);
    }
  }

  // Add response body
  contextParts.push(`RESPONSE_BODY: ${responseBodySummary}`);

  const contextData = contextParts.join('\n\n');
  const userMessage = buildContextMessage(contextData);

  // Estimate total tokens and warn if still too large
  const totalTokens = estimateTokenCount(SYSTEM_PROMPT + userMessage);
  if (totalTokens > AI_CONFIG.MAX_TOKENS_FOR_CONTEXT) {
    console.warn(`Context still large: ${totalTokens} tokens, may need further truncation`);
  }

  return {
    system: SYSTEM_PROMPT,
    user: userMessage,
  };
}

/**
 * Sends a chat completion request to the local LLM
 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
  const payload = {
    model: options.model || AI_CONFIG.DEFAULT_MODEL,
    messages,
    temperature: options.temperature || AI_CONFIG.DEFAULT_TEMPERATURE,
    max_tokens: options.max_tokens || AI_CONFIG.DEFAULT_MAX_TOKENS,
  };

  // Log context size for debugging
  console.log('Sending to LLM:', {
    model: payload.model,
    messageCount: payload.messages.length,
    estimatedTokens: estimateTokenCount(JSON.stringify(payload.messages))
  });

  try {
    const response = await fetch(AI_CONFIG.LLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!response.ok) {
      // Try to get the error details from response body
      let errorDetails = response.statusText;
      try {
        const errorText = await response.text();
        errorDetails = errorText || response.statusText;
      } catch {
        // Ignore if we can't read the error body
      }

      console.error('LLM request failed:', {
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      });

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorDetails}`,
      };
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        success: false,
        error: 'Invalid response format from LLM',
      };
    }

    return {
      success: true,
      content: data.choices[0].message.content,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out after 60 seconds',
        };
      }

      if (error.message.includes('fetch')) {
        return {
          success: false,
          error: 'Failed to connect to local AI engine. Is llama-server running on port 8080?',
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: 'Unknown error occurred',
    };
  }
}

/**
 * Converts API types to context types
 */
export function createRequestContext(request: ApiRequest): RequestContext {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    params: request.params,
    body: request.body?.content,
    bodyType: request.body?.type,
  };
}

export function createResponseContext(response: ApiResponse): ResponseContext {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.body,
    time: response.time,
    size: response.size,
  };
}

/**
 * Future enhancement: Chunk large responses for detailed analysis
 * Currently unused but available for implementing chunked analysis
 */
export function chunkLargeResponse(responseBody: string, maxChunkSize: number = 2000): string[] {
  if (responseBody.length <= maxChunkSize) {
    return [responseBody];
  }

  try {
    const parsed = JSON.parse(responseBody);

    if (Array.isArray(parsed)) {
      // Chunk arrays by items
      const chunks: string[] = [];
      const itemsPerChunk = Math.max(1, Math.floor(maxChunkSize / 100)); // Rough estimation

      for (let i = 0; i < parsed.length; i += itemsPerChunk) {
        const chunk = parsed.slice(i, i + itemsPerChunk);
        chunks.push(JSON.stringify(chunk, null, 2));
      }

      return chunks;
    } else {
      // For objects, split by keys (more complex, would need better implementation)
      const keys = Object.keys(parsed);
      const chunks: string[] = [];
      const keysPerChunk = Math.max(1, Math.floor(keys.length / 3));

      for (let i = 0; i < keys.length; i += keysPerChunk) {
        const chunkKeys = keys.slice(i, i + keysPerChunk);
        const chunkObj: any = {};
        chunkKeys.forEach(key => chunkObj[key] = parsed[key]);
        chunks.push(JSON.stringify(chunkObj, null, 2));
      }

      return chunks;
    }
  } catch {
    // For non-JSON, split by characters
    const chunks: string[] = [];
    for (let i = 0; i < responseBody.length; i += maxChunkSize) {
      chunks.push(responseBody.substring(i, i + maxChunkSize));
    }
    return chunks;
  }
}
/**
 * AI Prompts for Ask AI Feature
 *
 * This file contains all prompts used by the Ask AI feature.
 * Modify these to customize the AI's behavior and responses.
 */

export const AI_PROMPTS = {
  /**
   * System prompt - defines the AI's role and constraints
   */
  SYSTEM_PROMPT: `You are an API testing assistant embedded in a local desktop app.

Constraints:
- Be concise and precise
- Prefer bullet lists and short paragraphs
- If returning structured ideas (e.g., tests), return valid JSON that the app can parse
- If the context is partial, say what you're assuming
- Never invent endpoints or fields; if unsure, ask a clarifying question
- Do not include secrets
- Focus on practical API testing insights

Your role:
- Analyze API responses for patterns, errors, and anomalies
- Suggest test cases and edge cases
- Help debug API issues
- Explain response structures and data patterns
- Recommend best practices for API testing`,

  /**
   * Context setup prompt - explains the request/response context to AI
   * This is sent as the first user message but not shown in chat UI
   */
  CONTEXT_SETUP: (contextData: string) => `I'm sharing API request/response context for analysis:

${contextData}

Please wait for my specific questions about this API call. Don't provide analysis until I ask.`,

  /**
   * Welcome message shown to user when session starts
   */
  WELCOME_MESSAGE: "I'm ready to analyze this API response. What would you like to know?",

  /**
   * Fallback response if context is too large
   */
  LARGE_CONTEXT_NOTICE: `This response is quite large. I've received a summary of the key information. Feel free to ask about:
- Response structure and data types
- Potential issues or anomalies
- Suggested test cases
- Specific fields or patterns you're interested in`,

  /**
   * Example questions to show users
   */
  EXAMPLE_QUESTIONS: [
    "What's the structure of this response?",
    "Are there any potential issues with this API call?",
    "What test cases would you suggest for this endpoint?",
    "Explain the data patterns in this response",
    "What should I validate in this response?",
  ],

  /**
   * Error analysis prompts
   */
  ERROR_ANALYSIS: {
    STATUS_4XX: "I see this request returned a 4xx error. This typically indicates a client-side issue.",
    STATUS_5XX: "I see this request returned a 5xx error. This typically indicates a server-side issue.",
    TIMEOUT: "This request appears to have taken a long time. This might indicate performance issues.",
    LARGE_RESPONSE: "This response is quite large. Consider pagination if this is a list endpoint.",
  },

  /**
   * Success response analysis
   */
  SUCCESS_ANALYSIS: {
    FAST_RESPONSE: "Good response time! This endpoint appears to be performing well.",
    STRUCTURED_DATA: "The response has a clear, structured format which is good for API consumers.",
    PAGINATION_DETECTED: "I notice pagination markers in this response.",
  },
};

/**
 * Build the context message that gets sent to AI (but not shown in chat)
 */
export function buildContextMessage(contextData: string): string {
  return AI_PROMPTS.CONTEXT_SETUP(contextData);
}

/**
 * Get appropriate follow-up suggestions based on response characteristics
 */
export function getContextualSuggestions(status: number, responseSize: number, responseTime: number): string[] {
  const suggestions: string[] = [];

  if (status >= 400) {
    suggestions.push("What went wrong with this request?");
    suggestions.push("How can I fix this error?");
  } else {
    suggestions.push("What's the structure of this response?");
    suggestions.push("What should I test next?");
  }

  if (responseSize > 50000) {
    suggestions.push("Is this response too large?");
    suggestions.push("Should this endpoint use pagination?");
  }

  if (responseTime > 2000) {
    suggestions.push("Why is this response slow?");
    suggestions.push("How can I optimize this request?");
  }

  return suggestions.length > 0 ? suggestions : AI_PROMPTS.EXAMPLE_QUESTIONS;
}
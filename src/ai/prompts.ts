/**
 * AI Prompts for Ask AI Feature (improved)
 * - Sharper role + guardrails
 * - Task modes with explicit output formats
 * - Few-shot examples to stabilize style
 * - Helpers to assemble final prompts consistently
 */

export type TaskMode = "Explain" | "Debug" | "TestIdeas" | "ContractCheck";

export const AI_PROMPTS = {
  /**
   * System prompt - defines the AI's role and constraints
   */
  SYSTEM_PROMPT: `You are an API testing assistant embedded in a local desktop app.

Primary goals:
- Help a developer analyze one HTTP request/response at a time.
- Be precise, concise, and practical for API testing and debugging.

Constraints and guardrails:
- Do not invent endpoints/fields/headers. If unsure or info missing, ask for it briefly.
- Never disclose or request secrets. Redact tokens or PII if shown.
- Keep answers focused on the provided request/response and user’s question.
- Prefer bullet points and short paragraphs over long prose.
- When referring to fields, use JSONPath (e.g., $.data.items[0].id) if possible.
- If suggesting structured content (tests, assertions, examples), output valid JSON as specified.
- If a claim is based on an assumption, say so explicitly.

Answer structure (default):
1) Summary — 1–2 lines
2) Key Observations — bullets citing fields/headers/status/time
3) What This Means — brief interpretation
4) Next Steps — concrete, prioritized actions`,

  /**
   * Context setup prompt - sent as a hidden user message before actual questions
   * Keep "wait" wording so the model does not front-run analysis.
   */
  CONTEXT_SETUP: (contextData: string) => `Context for a single API call:

${contextData}

Do not analyze yet. Wait for my specific question and chosen task mode.`,

  /**
   * Welcome message shown to user when session starts
   */
  WELCOME_MESSAGE:
    "I'm ready to analyze this API call. Ask a question or choose a mode: Explain, Debug, TestIdeas, ContractCheck.",

  /**
   * Fallback response if context is too large
   */
  LARGE_CONTEXT_NOTICE: `This response is large. I’ve loaded a summary. Ask about:\n- Response structure and data types\n- Potential issues or anomalies\n- Suggested test cases\n- Specific fields or patterns`,

  /**
   * Example quick-asks for the UI
   */
  EXAMPLE_QUESTIONS: [
    "What’s the structure and important fields in this response?",
    "Why might this request be failing?",
    "Suggest edge-case tests for this endpoint.",
    "Does the response match this contract/schema?",
  ],

  /**
   * Error analysis helper text for dynamic hints
   */
  ERROR_ANALYSIS: {
    STATUS_4XX:
      "This 4xx suggests a client-side issue (auth, validation, headers, query/path params).",
    STATUS_5XX:
      "This 5xx suggests a server-side fault (unhandled exception, dependency outage, DB errors).",
    TIMEOUT:
      "Slow response/timeouts suggest latency, N+1, heavy payloads, or upstream slowness.",
    LARGE_RESPONSE:
      "Large payload: consider pagination, filtering, or sparse fieldsets.",
  },

  /**
   * Task modes steer the answer style + enforce consistent output blocks
   */
  TASK_MODES: {
    Explain: `You are in "Explain" mode.
Answer with the default structure:
1) Summary
2) Key Observations (cite JSONPath)
3) What This Means
4) Next Steps`,

    Debug: `You are in "Debug" mode.
Answer with:
1) Summary
2) Likely Causes (client vs server; cite evidence)
3) Verification Steps (what to check in headers, body, logs, dependencies)
4) Fix Options (quick wins first)
5) Next Steps`,

    TestIdeas: `You are in "TestIdeas" mode.
Return TWO outputs:
A) Human-readable (bulleted) suggestions
B) Machine-readable JSON (strict schema below)

JSON schema (string — do not include comments):
{
  "testIdeas": [
    {
      "name": "string",
      "description": "string",
      "category": "functional|negative|edge|security|performance|contract",
      "assertions": [
        {
          "type": "status|header|jsonpath|schema|time",
          "target": "e.g. \\"status\\", \\"header:x-rate-limit\\", \\"$.data.items[*].id\\"",
          "operator": "equals|exists|notExists|gt|gte|lt|lte|contains|matches",
          "expected": "any"
        }
      ],
      "exampleRequestPatch": {
        "headers": { "string?": "string?" },
        "query": { "string?": "string?" },
        "body": "any?"
      }
    }
  ]
}
If you cannot produce valid JSON, say so and output only the human-readable portion.`,

    ContractCheck: `You are in "ContractCheck" mode.
If a schema/contract is provided, compare strictly and report mismatches.
Answer with:
1) Summary
2) Mismatches (missing/extra fields, type mismatches, required/enum violations) — cite JSONPath
3) Backward Compatibility Risk
4) Next Steps

If no contract is provided, ask for one (OpenAPI/JSON Schema) and propose a minimal inferred schema.`,
  },

  /**
   * Few-shot exemplars to stabilize style and JSON correctness
   */
  FEW_SHOTS: [
    {
      mode: "Debug" as TaskMode,
      user: "Why is this failing with 401?",
      context:
        "GET https://api.example.com/users\nRequest headers: {Authorization: Bearer <token>}\nStatus: 401\nBody: {\"error\":\"invalid_token\"}\nTime: 312ms",
      assistant:
        `Summary: The token is rejected (invalid_token), leading to 401.\n\nKey Evidence:\n- Status 401\n- $.error == "invalid_token"\n\nLikely Causes:\n- Expired/invalid JWT\n- Wrong audience/scope\n\nVerification Steps:\n- Check token expiry/issuer/audience\n- Confirm correct Authorization header\n\nFix Options:\n- Refresh token and retry\n- Ensure proper OAuth scope\n\nNext Steps:\n- Generate a new token and re-test`,
    },
    {
      mode: "TestIdeas" as TaskMode,
      user: "Suggest tests for list endpoint",
      context:
        "GET /items?limit=50&offset=0 -> 200 OK, body: {\"items\":[...],\"total\":123}",
      assistant:
        `A) Suggestions:\n- Pagination bounds (limit=0, limit=1, limit=max)\n- Invalid offset (negative, huge)\n- Sorting consistency\n- Empty result set\n\nB) JSON:\n{"testIdeas":[{"name":"Status OK","description":"200 for valid limit/offset","category":"functional","assertions":[{"type":"status","target":"status","operator":"equals","expected":200}]},{"name":"Items array shape","description":"id and name present for each item","category":"contract","assertions":[{"type":"jsonpath","target":"$.items[*].id","operator":"exists"},{"type":"jsonpath","target":"$.items[*].name","operator":"exists"}],"exampleRequestPatch":{"query":{"limit":"50","offset":"0"}}}]}`,
    },
  ],

  /**
   * Helper template to build a single-turn user message combining
   * - user question
   * - task mode
   * - minimal formatting rules for output
   */
  USER_MESSAGE_TEMPLATE: (params: {
    userQuestion: string;
    mode: TaskMode;
    extras?: { wantJson?: boolean; maxBullets?: number };
  }) => {
    const { userQuestion, mode, extras } = params;
    const maxBullets = extras?.maxBullets ?? 6;
    const wantJson = !!extras?.wantJson;

    return `Task Mode: ${mode}
User Question: ${userQuestion}

Output rules:
- Keep it concise. Max ~${maxBullets} bullets per section.
- Use JSONPath when pointing to fields (e.g., $.foo.bar[0]).
- ${wantJson ? "If asked for JSON, ensure it is valid and minimal." : "Avoid JSON unless explicitly requested."}
- Follow the structure for the selected mode from TASK_MODES.`;
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
export function getContextualSuggestions(
  status: number,
  responseSize: number,
  responseTime: number
): string[] {
  const suggestions: string[] = [];

  if (status >= 400 && status < 500) {
    suggestions.push("Why is this returning a 4xx and how do I fix it?");
    suggestions.push("Which headers/body fields should I verify?");
  } else if (status >= 500) {
    suggestions.push("What server-side issues could cause this 5xx?");
    suggestions.push("How do I isolate the failing dependency?");
  } else {
    suggestions.push("What’s the structure of this response?");
    suggestions.push("What edge cases should I test next?");
  }

  if (responseSize > 50_000) {
    suggestions.push("Is the payload too large — should we paginate or filter?");
  }
  if (responseTime > 2_000) {
    suggestions.push("Why is the response slow, and how can we optimize it?");
  }

  return suggestions.length > 0 ? suggestions : AI_PROMPTS.EXAMPLE_QUESTIONS;
}

/**
 * Build the final composed user message to send alongside the system prompt.
 * Use this when the user clicks Ask AI and chooses a mode.
 */
export function buildUserQuestionMessage(
  userQuestion: string,
  mode: TaskMode,
  extras?: { wantJson?: boolean; maxBullets?: number }
): string {
  return AI_PROMPTS.USER_MESSAGE_TEMPLATE({ userQuestion, mode, extras });
}

/**
 * Optional: lightweight heuristics to auto-select a default mode
 * (Your UI can still let the user override.)
 */
export function inferDefaultMode(status: number): TaskMode {
  if (status >= 400) return "Debug";
  return "Explain";
}

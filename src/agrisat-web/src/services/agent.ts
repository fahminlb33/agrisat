/**
 * ADK Agent Service Client
 *
 * Communicates with the Google ADK FastAPI agent service using its REST API.
 *
 * LLM configuration is sent per-request in the X-Llm-Config header
 * (base64-encoded JSON). The agent builds a fresh model per request,
 * so each user's settings are fully isolated — no shared server config.
 */

import { useSettingsStore, buildLlmConfigHeader } from "#/stores/settings";

function getAgentHost(): string {
  return useSettingsStore.getState().llm.agentHost;
}

function getLlmConfigHeader(): string {
  return buildLlmConfigHeader(useSettingsStore.getState().llm);
}

const APP_NAME = "agrisat_agent";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class TokenBudgetError extends Error {
  constructor(
    public readonly used: number,
    public readonly budget: number,
  ) {
    super(
      `Token budget of ${budget.toLocaleString()} exhausted (${used.toLocaleString()} used). ` +
        "Add your own API key in Settings → LLM Connection.",
    );
    this.name = "TokenBudgetError";
  }
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

export interface ADKSession {
  id: string;
  userId: string;
  appName: string;
}

/**
 * Creates a new ADK session for the given user.
 */
export async function createSession(userId: string): Promise<ADKSession> {
  const res = await fetch(
    `${getAgentHost()}/apps/${APP_NAME}/users/${userId}/sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Llm-Config": getLlmConfigHeader(),
      },
      body: JSON.stringify({ state: {} }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    userId,
    appName: APP_NAME,
  };
}

// ---------------------------------------------------------------------------
// Streaming Chat
// ---------------------------------------------------------------------------

export interface RunAgentSSEParams {
  appName?: string;
  userId: string;
  sessionId: string;
  message: string;
}

export interface ADKEvent {
  content: {
    parts?: Array<{
      text?: string;
      inline_data?: { mime_type: string; data: string };
      function_call?: { name: string; args: Record<string, unknown> };
      function_response?: { name: string; response: unknown };
    }>;
    role?: string;
  };
  partial?: boolean;
  turnComplete?: boolean;
  actions?: Record<string, unknown>;
}

/**
 * Sends a message to the ADK agent and returns an async iterator of SSE events.
 * LLM config is embedded in X-Llm-Config — fully per-user, no server state.
 */
export async function* runAgentSSE(
  params: RunAgentSSEParams,
): AsyncGenerator<ADKEvent> {
  const { userId, sessionId, message, appName = APP_NAME } = params;

  const res = await fetch(`${getAgentHost()}/run_sse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Llm-Config": getLlmConfigHeader(),
    },
    body: JSON.stringify({
      app_name: appName,
      user_id: userId,
      session_id: sessionId,
      new_message: {
        role: "user",
        parts: [{ text: message }],
      },
      streaming: true,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      throw new TokenBudgetError(body.used ?? 0, body.budget ?? 0);
    }
    throw new Error(`Agent request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          try {
            const event = JSON.parse(data) as ADKEvent;
            yield event;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.startsWith("data: ")) {
      const data = buffer.slice(6).trim();
      if (data && data !== "[DONE]") {
        try {
          const event = JSON.parse(data) as ADKEvent;
          yield event;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Token usage (read-only, from server)
// ---------------------------------------------------------------------------

export interface TokenUsage {
  user_id: string;
  used: number;
  budget: number;
}

export async function fetchTokenUsage(userId: string): Promise<TokenUsage> {
  const res = await fetch(
    `${getAgentHost()}/config/usage/${encodeURIComponent(userId)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TokenUsage>;
}

/**
 * ADK Agent Service Client
 *
 * Communicates with the Google ADK FastAPI agent service using its REST API.
 * The ADK exposes:
 * - POST /apps/{app_name}/users/{user_id}/sessions — create session
 * - POST /run_sse — run agent with SSE streaming
 *
 * The agent app name is "agrisat_agent" (matches the `name` field in agent.py).
 */

const AGENT_HOST = import.meta.env.VITE_AGENT_HOST ?? "http://127.0.0.1:8080";
const APP_NAME = "agrisat_agent";

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
    `${AGENT_HOST}/apps/${APP_NAME}/users/${userId}/sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  /** Raw event content from ADK */
  content: {
    parts?: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>;
    role?: string;
  };
  /** Whether this is a partial streaming chunk */
  partial?: boolean;
  /** Turn complete flag */
  turnComplete?: boolean;
  /** Actions from the agent */
  actions?: Record<string, unknown>;
}

/**
 * Sends a message to the ADK agent and returns an async iterator of SSE events.
 * Uses the /run_sse endpoint for streaming responses.
 */
export async function* runAgentSSE(
  params: RunAgentSSEParams,
): AsyncGenerator<ADKEvent> {
  const { userId, sessionId, message, appName = APP_NAME } = params;

  const res = await fetch(`${AGENT_HOST}/run_sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

      // Parse SSE events from buffer
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

import { useReducer, useCallback, useRef } from "react";
import { createSession, runAgentSSE, TokenBudgetError, type ADKSession } from "#/services/agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Base64-encoded images returned by the agent (e.g. raster PNGs) */
  images?: Array<{ mimeType: string; data: string }>;
  timestamp: Date;
}

export type ChatStatus =
  | "idle"
  | "creating-session"
  | "thinking"
  | "tool-calling"
  | "streaming"
  | "error";

export interface UseAgentChatOptions {
  /** Unique user identifier. Defaults to "web-user". */
  userId?: string;
}

export interface UseAgentChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Human-readable label for what the agent is currently doing */
  activity: string | null;
  error: string | null;
  sendMessage: (text: string, displayText?: string) => Promise<void>;
  stop: () => void;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Reducer — combined state
// ---------------------------------------------------------------------------

interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  activity: string | null;
  error: string | null;
}

type ChatAction =
  | { type: "USER_MESSAGE"; message: ChatMessage }
  | { type: "CREATING_SESSION" }
  | { type: "ASSISTANT_INIT"; message: ChatMessage }
  | { type: "THINKING" }
  | { type: "TOOL_CALL"; label: string }
  | { type: "STREAMING"; text: string; images: Array<{ mimeType: string; data: string }>; assistantId: string }
  | { type: "TURN_COMPLETE"; assistantId: string }
  | { type: "ERROR"; error: string }
  | { type: "STOP" }
  | { type: "CLEAR" };

const initialChatState: ChatState = {
  messages: [],
  status: "idle",
  activity: null,
  error: null,
};

/**
 * Reducer for all chat state.
 *
 * Key invariant: status-only transitions (THINKING, TOOL_CALL, CREATING_SESSION,
 * STOP) return `{ ...state, status, activity }` — the `messages` array
 * reference is preserved, so consumers that depend on `messages` don't
 * re-render when only the loading indicator changes (REQ-4.2, REQ-4.3).
 */
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "USER_MESSAGE":
      // Append user message and clear any previous error
      return {
        ...state,
        error: null,
        messages: [...state.messages, action.message],
      };

    case "CREATING_SESSION":
      // Status-only — messages ref preserved intentionally
      return { ...state, status: "creating-session", activity: null };

    case "ASSISTANT_INIT":
      // Append placeholder assistant message and transition to "thinking"
      return {
        ...state,
        status: "thinking",
        activity: "Thinking...",
        messages: [...state.messages, action.message],
      };

    case "THINKING":
      // Status-only — messages ref preserved intentionally
      return { ...state, status: "thinking", activity: "Thinking..." };

    case "TOOL_CALL":
      // Status-only — messages ref preserved intentionally
      return { ...state, status: "tool-calling", activity: action.label };

    case "STREAMING":
      // Updates messages content + status + activity in a single render pass
      return {
        ...state,
        status: "streaming",
        activity: null,
        messages: state.messages.map((msg) =>
          msg.id === action.assistantId
            ? { ...msg, content: action.text, images: action.images.length > 0 ? action.images : msg.images }
            : msg,
        ),
      };

    case "TURN_COMPLETE": {
      // If the assistant produced no text and no images, remove its empty placeholder.
      // Otherwise preserve the messages array reference (no filtering needed).
      const hasContent = state.messages.some(
        (msg) => msg.id === action.assistantId && (msg.content.length > 0 || (msg.images && msg.images.length > 0)),
      );
      return {
        ...state,
        status: "idle",
        activity: null,
        messages: hasContent
          ? state.messages // ref preserved — no content change
          : state.messages.filter((msg) => msg.id !== action.assistantId),
      };
    }

    case "ERROR":
      return { ...state, status: "error", activity: null, error: action.error };

    case "STOP":
      // Status-only — messages ref preserved intentionally
      return { ...state, status: "idle", activity: null };

    case "CLEAR":
      return { ...initialChatState };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let messageCounter = 0;
function generateId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

/**
 * Maps ADK tool/function names to user-friendly activity labels.
 */
const TOOL_LABELS: Record<string, string> = {
  get_current_date: "Checking date...",
  list_levels: "Loading zone hierarchy...",
  list_zones: "Fetching zones...",
  list_variables: "Loading variables...",
  list_environment_time_indices: "Checking available dates...",
  get_environment_stats: "Analyzing satellite data...",
  list_weather_time_indices: "Checking weather data...",
  get_weather_stats: "Fetching weather stats...",
  get_environment_raster: "Generating raster map...",
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "Processing...";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for communicating with the ADK agent via SSE streaming.
 *
 * Manages session creation, message history, and streaming state.
 * Sessions are created lazily on first message send.
 *
 * Internally uses a single `useReducer` so that batched state transitions
 * (e.g. STREAMING updates messages + status + activity) produce exactly one
 * React render per dispatch. Status-only transitions (THINKING, TOOL_CALL,
 * STOP) preserve the `messages` array reference so message-list consumers
 * don't re-render unnecessarily. (REQ-3, REQ-4)
 */
export function useAgentChat(options: UseAgentChatOptions = {}): UseAgentChatReturn {
  const { userId = "web-user" } = options;

  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const sessionRef = useRef<ADKSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // RAF-based flush for streaming text accumulation (REQ-3.1)
  // pendingTextRef holds the full accumulated text since the last flush.
  // rafRef holds the scheduled animation frame ID, or null if none is pending.
  const pendingTextRef = useRef("");
  const pendingImagesRef = useRef<Array<{ mimeType: string; data: string }>>([]);
  const rafRef = useRef<number | null>(null);

  /**
   * Schedules a RAF flush of accumulated streaming text.
   *
   * If a frame is already scheduled, this is a no-op (coalescing). The RAF
   * callback dispatches STREAMING with the full accumulated text so far.
   * pendingTextRef is NOT cleared after dispatch — the STREAMING reducer action
   * sets the full accumulated text on the message (not a delta), so the ref
   * must continue to hold the running total for subsequent flushes.
   *
   * REQ-3.1: caps render frequency to ~60fps regardless of SSE event rate.
   */
  function scheduleFlush(assistantId: string) {
    if (rafRef.current !== null) return; // already scheduled — coalescing
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!pendingTextRef.current && pendingImagesRef.current.length === 0) return;
      dispatch({ type: "STREAMING", text: pendingTextRef.current, images: [...pendingImagesRef.current], assistantId });
      // NOTE: do NOT clear pendingTextRef here — STREAMING sets full accumulated
      // text on the message, not a delta. The ref keeps the running total.
    });
  }

  /**
   * Ensures a session exists, creating one if needed.
   */
  const ensureSession = useCallback(async (): Promise<ADKSession> => {
    if (sessionRef.current) return sessionRef.current;

    dispatch({ type: "CREATING_SESSION" });
    const session = await createSession(userId);
    sessionRef.current = session;
    return session;
  }, [userId]);

  /**
   * Sends a message to the agent and streams the response.
   *
   * @param text - The full message to send to the agent (may include mode prefix)
   * @param displayText - Optional text to show in the chat bubble (without prefix).
   *                      If omitted, `text` is used for display.
   */
  const sendMessage = useCallback(
    async (text: string, displayText?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Append user message (also clears any previous error)
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: (displayText ?? text).trim(),
        timestamp: new Date(),
      };
      dispatch({ type: "USER_MESSAGE", message: userMessage });

      try {
        // Ensure session exists (may set status → "creating-session" then return)
        const session = await ensureSession();

        // Create abort controller for cancellation
        const abort = new AbortController();
        abortRef.current = abort;

        // Append placeholder assistant message and transition to "thinking"
        const assistantId = generateId();
        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        };
        dispatch({ type: "ASSISTANT_INIT", message: assistantMessage });

        // Stream response from ADK
        for await (const event of runAgentSSE({
          userId: session.userId,
          sessionId: session.id,
          message: trimmed,
        })) {
          // Check if aborted
          if (abort.signal.aborted) break;

          // Extract text and detect tool calls from event content parts
          const parts = event.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                // Accumulate into ref and schedule a RAF flush (REQ-3.1).
                // Multiple SSE chunks arriving within the same frame are
                // coalesced into a single STREAMING dispatch.
                pendingTextRef.current += part.text;
                scheduleFlush(assistantId);
              }
              if (part.inline_data) {
                // Accumulate agent-returned images (e.g. raster PNGs)
                pendingImagesRef.current.push({
                  mimeType: part.inline_data.mime_type,
                  data: part.inline_data.data,
                });
                scheduleFlush(assistantId);
              }
              if (part.function_call) {
                dispatch({
                  type: "TOOL_CALL",
                  label: getToolLabel(part.function_call.name),
                });
              }
              if (part.function_response) {
                // Tool finished, back to thinking before next action
                dispatch({ type: "THINKING" });
              }
            }
          }

          // Check for turn complete
          if (event.turnComplete) break;
        }

        // turnComplete: cancel any pending RAF and flush synchronously so the
        // full response is visible before the loading indicator clears (REQ-3.3)
        cancelAnimationFrame(rafRef.current ?? 0);
        rafRef.current = null;
        if (pendingTextRef.current || pendingImagesRef.current.length > 0) {
          dispatch({ type: "STREAMING", text: pendingTextRef.current, images: [...pendingImagesRef.current], assistantId });
        }

        // TURN_COMPLETE handles removing an empty assistant placeholder if no
        // text was ever received, and resets status → "idle" in one dispatch
        dispatch({ type: "TURN_COMPLETE", assistantId });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          dispatch({ type: "STOP" });
          return;
        }

        const errorMessage =
          err instanceof TokenBudgetError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        dispatch({ type: "ERROR", error: errorMessage });
      } finally {
        // Cancel any pending RAF and reset accumulator on cleanup (e.g. abort,
        // error, or normal completion)
        cancelAnimationFrame(rafRef.current ?? 0);
        rafRef.current = null;
        pendingTextRef.current = "";
        pendingImagesRef.current = [];
        abortRef.current = null;
      }
    },
    [ensureSession],
  );

  /**
   * Stops the current streaming response.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Cancel any pending RAF flush so no stale update fires after stop
    cancelAnimationFrame(rafRef.current ?? 0);
    rafRef.current = null;
    dispatch({ type: "STOP" });
  }, []);

  /**
   * Clears all messages and resets the session.
   */
  const clearMessages = useCallback(() => {
    dispatch({ type: "CLEAR" });
    sessionRef.current = null;
  }, []);

  return {
    messages: state.messages,
    status: state.status,
    activity: state.activity,
    error: state.error,
    sendMessage,
    stop,
    clearMessages,
  };
}

import { useState, useCallback, useRef } from "react";
import { createSession, runAgentSSE, type ADKSession } from "#/services/agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
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
	sendMessage: (text: string) => Promise<void>;
	stop: () => void;
	clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Hook
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

/**
 * Custom hook for communicating with the ADK agent via SSE streaming.
 *
 * Manages session creation, message history, and streaming state.
 * Sessions are created lazily on first message send.
 */
export function useAgentChat(
	options: UseAgentChatOptions = {},
): UseAgentChatReturn {
	const { userId = "web-user" } = options;

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<ChatStatus>("idle");
	const [activity, setActivity] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const sessionRef = useRef<ADKSession | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	/**
	 * Ensures a session exists, creating one if needed.
	 */
	const ensureSession = useCallback(async (): Promise<ADKSession> => {
		if (sessionRef.current) return sessionRef.current;

		setStatus("creating-session");
		const session = await createSession(userId);
		sessionRef.current = session;
		return session;
	}, [userId]);

	/**
	 * Sends a message to the agent and streams the response.
	 */
	const sendMessage = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;

			setError(null);

			// Add user message
			const userMessage: ChatMessage = {
				id: generateId(),
				role: "user",
				content: trimmed,
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, userMessage]);

			try {
				// Ensure session exists
				const session = await ensureSession();

				// Create abort controller for cancellation
				const abort = new AbortController();
				abortRef.current = abort;

				setStatus("thinking");
				setActivity("Thinking...");

				// Add placeholder assistant message
				const assistantId = generateId();
				const assistantMessage: ChatMessage = {
					id: assistantId,
					role: "assistant",
					content: "",
					timestamp: new Date(),
				};
				setMessages((prev) => [...prev, assistantMessage]);

				// Stream response from ADK
				let fullText = "";
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
								fullText += part.text;
								// Once we have text, we're streaming the response
								setStatus("streaming");
								setActivity(null);
							}
							if (part.function_call) {
								setStatus("tool-calling");
								setActivity(getToolLabel(part.function_call.name));
							}
							if (part.function_response) {
								// Tool finished, back to thinking before next action
								setStatus("thinking");
								setActivity("Thinking...");
							}
						}
					}

					// Update the assistant message with accumulated text
					if (fullText) {
						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === assistantId ? { ...msg, content: fullText } : msg,
							),
						);
					}

					// Check for turn complete
					if (event.turnComplete) break;
				}

				// If no text was received, remove the empty assistant message
				if (!fullText) {
					setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
				}

				setStatus("idle");
				setActivity(null);
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") {
					setStatus("idle");
					setActivity(null);
					return;
				}

				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				setError(errorMessage);
				setStatus("error");
				setActivity(null);
			} finally {
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
		setStatus("idle");
		setActivity(null);
	}, []);

	/**
	 * Clears all messages and resets the session.
	 */
	const clearMessages = useCallback(() => {
		setMessages([]);
		setError(null);
		setStatus("idle");
		setActivity(null);
		sessionRef.current = null;
	}, []);

	return {
		messages,
		status,
		activity,
		error,
		sendMessage,
		stop,
		clearMessages,
	};
}

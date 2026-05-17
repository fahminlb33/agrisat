/**
 * Chat-related type definitions for the AI Assistant panel.
 */

/**
 * The four interaction modes available in the AI assistant.
 * Each mode tailors the AI's response style and context retrieval strategy.
 */
export type ChatMode = "explain" | "compare" | "predict" | "recommend";

/**
 * Labels for each chat mode, used in the UI tabs.
 */
export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  explain: "Explain",
  compare: "Compare",
  predict: "Predict",
  recommend: "Recommend",
} as const;

/**
 * All available chat modes as an ordered array (for rendering tabs).
 */
export const CHAT_MODES: ChatMode[] = [
  "explain",
  "compare",
  "predict",
  "recommend",
] as const;

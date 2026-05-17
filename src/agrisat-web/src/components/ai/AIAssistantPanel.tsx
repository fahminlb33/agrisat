"use client";

import { X, Trash2, Bot, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { useAgentChat } from "#/hooks/useAgentChat.ts";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#/components/ai-elements/conversation.tsx";
import {
  Suggestions,
  Suggestion,
} from "#/components/ai-elements/suggestion.tsx";
import type { ChatMode } from "#/types/chat";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIAssistantPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback to close the panel */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Suggestions per mode
// ---------------------------------------------------------------------------

const MODE_SUGGESTIONS: Record<ChatMode, string[]> = {
  explain: [
    "Apa itu NDVI?",
    "Jelaskan kondisi sawah di Bogor Barat",
    "What does low NDMI mean?",
  ],
  compare: [
    "Bandingkan NDVI Bogor Barat vs Bogor Timur",
    "Compare last week vs this week",
    "Perbandingan kesehatan tanaman antar kecamatan",
  ],
  predict: [
    "Prediksi cuaca 7 hari ke depan",
    "Will it rain this week?",
    "Kapan waktu terbaik untuk pemupukan?",
  ],
  recommend: [
    "Rekomendasi untuk sawah dengan NDVI rendah",
    "What should I do about nitrogen stress?",
    "Saran penanganan hama",
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AI Assistant Panel — a toggleable right-side panel providing conversational
 * AI for agricultural insights, powered by the Google ADK agent.
 *
 * Uses ai-elements components (Conversation, Suggestion) for the chat UI
 * and the custom `useAgentChat` hook for ADK communication.
 */
export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const [activeMode, setActiveMode] = useState<ChatMode>("explain");
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  const { messages, status, error, sendMessage, stop, clearMessages } =
    useAgentChat({ userId: "web-user" });

  const isLoading = status === "streaming" || status === "creating-session";

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    submitMessage(trimmed);
  };

  // Submit with optional mode prefix
  const submitMessage = (text: string) => {
    const modePrefix = activeMode !== "explain" ? `[Mode: ${activeMode}] ` : "";
    sendMessage(`${modePrefix}${text}`);
    setInputValue("");
    inputRef.current?.focus();
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    submitMessage(suggestion);
  };

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  return (
    <aside
      className={cn(
        "shrink-0 overflow-hidden border-l border-border bg-card transition-all duration-200",
        open ? "w-[380px] opacity-100" : "w-0 opacity-0 border-l-0",
      )}
      aria-label="AI assistant panel"
    >
      {open && (
        <div className="flex h-full w-[380px] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">AI Agro Assistant</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearMessages}
                aria-label="Clear chat history"
                className="h-7 w-7"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close AI assistant"
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex border-b border-border">
            {(["explain", "compare", "predict", "recommend"] as const).map(
              (mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActiveMode(mode)}
                  className={cn(
                    "flex-1 px-2 py-2 text-xs font-medium capitalize transition-colors",
                    activeMode === mode
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={activeMode === mode}
                >
                  {mode}
                </button>
              ),
            )}
          </div>

          {/* Messages area using ai-elements Conversation */}
          <Conversation className="flex-1">
            <ConversationContent className="gap-4 p-3">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="h-8 w-8" />}
                  title="AgriSat AI Assistant"
                  description="Ask about crop health, weather forecasts, or explore monitoring zones."
                />
              ) : (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                  />
                ))
              )}

              {/* Streaming indicator */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce">·</span>
                      <span className="animate-bounce [animation-delay:0.1s]">·</span>
                      <span className="animate-bounce [animation-delay:0.2s]">·</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* Suggestions */}
          {messages.length === 0 && (
            <div className="border-t border-border px-3 py-2">
              <Suggestions className="gap-1.5">
                {MODE_SUGGESTIONS[activeMode].map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    suggestion={suggestion}
                    onClick={handleSuggestionClick}
                    className="text-xs"
                  />
                ))}
              </Suggestions>
            </div>
          )}

          {/* Cancel button during streaming */}
          {isLoading && (
            <div className="flex justify-center border-t border-border px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={stop}
                className="text-xs text-muted-foreground"
              >
                Stop generating
              </Button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-border p-3"
          >
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about your field..."
              disabled={isLoading}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Chat message input"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim() || isLoading}
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex items-start justify-end gap-2">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
          {content}
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

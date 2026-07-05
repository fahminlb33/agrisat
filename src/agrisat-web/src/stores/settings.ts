import { create } from "zustand";
import { persist } from "zustand/middleware";
import { env } from "#/lib/env";

// ---------------------------------------------------------------------------
// LLM config
// ---------------------------------------------------------------------------

export type LlmProvider = "gemini" | "ollama" | "lmstudio";

export interface LlmSettings {
  provider: LlmProvider;
  /** ADK agent host URL */
  agentHost: string;
  // Gemini
  geminiModel: string;
  /** BYOK: user-supplied Gemini API key. Empty = use server's in-house key. */
  geminiApiKey: string;
  // Ollama
  ollamaBaseUrl: string;
  ollamaModel: string;
  // LM Studio
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  /**
   * Token budget for this user (0 = unlimited).
   * Shown in UI as a usage meter when using the in-house key.
   */
  tokenBudget: number;
}

// ---------------------------------------------------------------------------
// Full settings shape
// ---------------------------------------------------------------------------

export interface AppSettings {
  llm: LlmSettings;
}

export interface SettingsActions {
  setLlm(patch: Partial<LlmSettings>): void;
  reset(): void;
}

export type SettingsStore = AppSettings & SettingsActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_LLM: LlmSettings = {
  provider: "gemini",
  agentHost: env.VITE_AGENT_HOST,
  geminiModel: "gemma-4-26b-a4b-it",
  geminiApiKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  lmStudioBaseUrl: "http://localhost:1234",
  lmStudioModel: "local-model",
  tokenBudget: 0,
};

const DEFAULT_SETTINGS: AppSettings = { llm: DEFAULT_LLM };

/**
 * Merge persisted partial data with defaults.
 * Ensures any new fields added to DEFAULT_LLM are always present,
 * even when loading an older localStorage entry that predates the field.
 */
function mergeLlm(persisted: Partial<LlmSettings>): LlmSettings {
  return { ...DEFAULT_LLM, ...persisted };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsStore>()( 
  persist<SettingsStore, [], [], Pick<AppSettings, "llm">>(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setLlm(patch) {
        set((s) => ({ llm: { ...s.llm, ...patch } }));
      },

      reset() {
        set(DEFAULT_SETTINGS);
      },
    }),
    {
      name: "agrisat-settings",
      partialize: (s) => ({ llm: s.llm }),
      // Merge on rehydration so missing fields get defaults
      merge: (persisted, current) => {
        const p = persisted as Partial<AppSettings>;
        return {
          ...current,
          llm: mergeLlm(p.llm ?? {}),
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectAgentHost(s: SettingsStore) {
  return s.llm.agentHost;
}

// ---------------------------------------------------------------------------
// Build the X-Llm-Config header value for agent requests
// ---------------------------------------------------------------------------

/**
 * Encodes current LLM settings as a base64 JSON string for the
 * X-Llm-Config request header. The agent server decodes this to
 * build the per-request model — no shared server state needed.
 */
export function buildLlmConfigHeader(llm: LlmSettings): string {
  const payload = {
    provider: llm.provider,
    gemini_model: llm.geminiModel,
    // Only send the key if it's actually set — never send an empty string
    ...(llm.geminiApiKey.trim() ? { gemini_api_key: llm.geminiApiKey.trim() } : {}),
    ollama_base_url: llm.ollamaBaseUrl,
    ollama_model: llm.ollamaModel,
    lmstudio_base_url: llm.lmStudioBaseUrl,
    lmstudio_model: llm.lmStudioModel,
  };
  return btoa(JSON.stringify(payload));
}

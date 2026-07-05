/**
 * Runtime environment configuration.
 *
 * Vite statically replaces `import.meta.env.VITE_*` at build time. When building
 * inside Docker without a `.env` file, those values become `undefined`. This module
 * provides a runtime fallback: if `window.__ENV__` is populated (injected by the
 * entrypoint script at container startup), those values take precedence.
 *
 * Usage:
 *   import { env } from "#/lib/env";
 *   env.VITE_API_HOST  // works at both dev-time and runtime
 */

interface RuntimeEnv {
  VITE_API_HOST: string;
  VITE_API_USERNAME: string;
  VITE_API_PASSWORD: string;
  VITE_AGENT_HOST: string;
  VITE_AI_ENABLED: string;
}

declare global {
  interface Window {
    __ENV__?: Partial<RuntimeEnv>;
  }
}

function ensureApiPath(host: string): string {
  const trimmed = host.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function getEnv(): RuntimeEnv {
  const w = typeof window !== "undefined" ? window.__ENV__ ?? {} : {};

  const apiHost = w.VITE_API_HOST || import.meta.env.VITE_API_HOST || "/api";

  return {
    VITE_API_HOST: ensureApiPath(apiHost),
    VITE_API_USERNAME:
      w.VITE_API_USERNAME || import.meta.env.VITE_API_USERNAME || "",
    VITE_API_PASSWORD:
      w.VITE_API_PASSWORD || import.meta.env.VITE_API_PASSWORD || "",
    VITE_AGENT_HOST:
      w.VITE_AGENT_HOST || import.meta.env.VITE_AGENT_HOST || "/adk",
    VITE_AI_ENABLED:
      w.VITE_AI_ENABLED ?? import.meta.env.VITE_AI_ENABLED ?? "true",
  };
}

export const env = getEnv();

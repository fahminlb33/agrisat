"use client";

import { useState } from "react";
import {
  Settings,
  Cpu,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Key,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { useSettingsStore, type LlmProvider } from "#/stores/settings";
import { useTokenUsage } from "#/hooks/useTokenUsage";
import { cn } from "#/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TestStatus = "idle" | "testing" | "ok" | "error";

// ---------------------------------------------------------------------------
// Token Usage Meter
// ---------------------------------------------------------------------------

function TokenUsageMeter({ userId = "web-user" }: { userId?: string }) {
  const { used, budget, pct, exceeded, isLoading } = useTokenUsage(userId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking usage…
      </div>
    );
  }

  if (budget === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Zap className="h-3 w-3" />
        Token usage metering disabled (unlimited)
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-medium",
            exceeded ? "text-destructive" : "text-foreground",
          )}
        >
          {exceeded ? "Budget exhausted" : "Token usage this session"}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {used.toLocaleString()} / {budget.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 100
              ? "bg-destructive"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM Connection Tab
// ---------------------------------------------------------------------------

function LlmTab() {
  const { llm, setLlm } = useSettingsStore();
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const provider = llm.provider;
  const isLocal = provider === "ollama" || provider === "lmstudio";
  const usingByok =
    provider === "gemini" && (llm.geminiApiKey ?? "").trim().length > 0;

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestError(null);
    try {
      const res = await fetch(`${llm.agentHost}/list-apps`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      setTestStatus("ok");
    } catch (err) {
      setTestStatus("error");
      setTestError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Info banner ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
        Settings are sent with every request — changes apply instantly, no
        restart needed. Each user's config is fully independent.
      </div>

      {/* ── Agent Host ───────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-host">Agent Host URL</Label>
        <p className="text-xs text-muted-foreground">
          Address of the running ADK agent server.
        </p>
        <div className="flex gap-2">
          <Input
            id="agent-host"
            value={llm.agentHost}
            onChange={(e) => setLlm({ agentHost: e.target.value })}
            placeholder="http://localhost:8080"
            className="flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testStatus === "testing"}
            className="shrink-0 gap-1.5"
          >
            {testStatus === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : testStatus === "ok" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : testStatus === "error" ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : null}
            Test
          </Button>
        </div>
        {testStatus === "ok" && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Agent reachable
          </p>
        )}
        {testStatus === "error" && testError && (
          <p className="text-xs text-destructive">{testError}</p>
        )}
      </div>

      {/* ── Provider ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="llm-provider">LLM Provider</Label>
        <Select
          value={provider}
          onValueChange={(v) => setLlm({ provider: v as LlmProvider })}
        >
          <SelectTrigger id="llm-provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Gemini (cloud)</SelectItem>
            <SelectItem value="ollama">Ollama (local)</SelectItem>
            <SelectItem value="lmstudio">LM Studio (local)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Gemini ───────────────────────────────────────────────── */}
      {provider === "gemini" && (
        <ProviderSection label="Gemini">
          <FieldRow label="Model" htmlFor="gemini-model">
            <Input
              id="gemini-model"
              value={llm.geminiModel}
              onChange={(e) => setLlm({ geminiModel: e.target.value })}
              placeholder="gemma-4-26b-a4b-it"
              className="font-mono text-xs"
            />
          </FieldRow>

          <FieldRow label="Your API key (optional — BYOK)" htmlFor="gemini-key">
            <div className="relative">
              <Input
                id="gemini-key"
                type={showApiKey ? "text" : "password"}
                value={llm.geminiApiKey ?? ""}
                onChange={(e) => setLlm({ geminiApiKey: e.target.value })}
                placeholder="Leave empty to use the shared in-house key"
                className="pr-9 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </FieldRow>

          {usingByok ? (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Key className="h-3 w-3 shrink-0" />
              Using your own API key — no token budget applies.
            </div>
          ) : (
            <div className="space-y-2">
              <Note>
                No key supplied — using the shared in-house key. Token usage is
                metered against the server budget.
              </Note>
              <TokenUsageMeter />
            </div>
          )}
        </ProviderSection>
      )}

      {/* ── Ollama ───────────────────────────────────────────────── */}
      {provider === "ollama" && (
        <ProviderSection label="Ollama">
          <FieldRow label="Base URL" htmlFor="ollama-url">
            <Input
              id="ollama-url"
              value={llm.ollamaBaseUrl}
              onChange={(e) => setLlm({ ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Model" htmlFor="ollama-model">
            <Input
              id="ollama-model"
              value={llm.ollamaModel}
              onChange={(e) => setLlm({ ollamaModel: e.target.value })}
              placeholder="llama3.2"
              className="font-mono text-xs"
            />
          </FieldRow>
          <Note>
            Pull the model first:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              ollama pull {llm.ollamaModel || "llama3.2"}
            </code>
          </Note>
        </ProviderSection>
      )}

      {/* ── LM Studio ────────────────────────────────────────────── */}
      {provider === "lmstudio" && (
        <ProviderSection label="LM Studio">
          <FieldRow label="Base URL" htmlFor="lms-url">
            <Input
              id="lms-url"
              value={llm.lmStudioBaseUrl}
              onChange={(e) => setLlm({ lmStudioBaseUrl: e.target.value })}
              placeholder="http://localhost:1234"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Model identifier" htmlFor="lms-model">
            <Input
              id="lms-model"
              value={llm.lmStudioModel}
              onChange={(e) => setLlm({ lmStudioModel: e.target.value })}
              placeholder="local-model"
              className="font-mono text-xs"
            />
          </FieldRow>
          <Note>
            Model identifier must match the loaded model name in LM Studio.
            Start the local server before connecting.
          </Note>
        </ProviderSection>
      )}

      {/* ── Local: no budget ─────────────────────────────────────── */}
      {isLocal && (
        <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
          <Key className="h-3 w-3 shrink-0" />
          Running locally — no API key or token budget required.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ProviderSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label} settings
      </p>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export interface SettingsDialogProps {
  trigger?: React.ReactNode;
}

export function SettingsDialog({ trigger }: SettingsDialogProps) {
  const { reset } = useSettingsStore();
  const [open, setOpen] = useState(false);

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Open settings"
      className={cn(
        "gap-1.5 text-xs text-sidebar-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Settings className="h-4 w-4" />
      <span className="hidden sm:inline">Settings</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="llm">
          <TabsList className="w-full">
            <TabsTrigger value="llm" className="flex-1 gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              LLM Connection
            </TabsTrigger>
          </TabsList>

          <TabsContent value="llm" className="mt-4">
            <LlmTab />
          </TabsContent>
        </Tabs>

        <div className="-mx-4 -mb-4 flex items-center justify-between rounded-b-xl border-t bg-muted/50 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-xs text-muted-foreground"
          >
            Reset to defaults
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

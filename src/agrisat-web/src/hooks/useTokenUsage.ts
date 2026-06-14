import { useQuery } from "@tanstack/react-query";
import { fetchTokenUsage } from "#/services/agent";
import { useSettingsStore } from "#/stores/settings";

export function useTokenUsage(userId = "web-user") {
  const agentHost = useSettingsStore((s) => s.llm.agentHost);

  const query = useQuery({
    queryKey: ["token-usage", agentHost, userId],
    queryFn: () => fetchTokenUsage(userId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
    // Don't throw on error — agent might be unreachable
  });

  const used = query.data?.used ?? 0;
  const budget = query.data?.budget ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const exceeded = budget > 0 && used >= budget;

  return { used, budget, pct, exceeded, isLoading: query.isLoading };
}

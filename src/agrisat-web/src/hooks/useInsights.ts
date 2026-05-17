import { useQuery } from "@tanstack/react-query";
import { getZoneAnalysis } from "#/services/api";
import type { ZoneAnalysis } from "#/types/api";

/**
 * Query key factory for insights/analysis queries.
 */
export const insightsKeys = {
	all: ["insights"] as const,
	analysis: (params: {
		zoneId: number | null;
		startTs: Date;
		endTs: Date;
		variableKeys?: string[];
	}) =>
		[
			...insightsKeys.all,
			"analysis",
			params.zoneId,
			params.startTs.toISOString(),
			params.endTs.toISOString(),
			params.variableKeys,
		] as const,
};

/**
 * Fetches zone analysis with metrics and insights.
 *
 * - Validates response with Zod schema (Requirement 11.5)
 * - Stale time: 5 minutes for time series data (stale-while-revalidate)
 * - Only enabled when zoneId is provided
 */
export function useInsights(params: {
	zoneId: number | null;
	startTs: Date;
	endTs: Date;
	variableKeys?: string[];
	enabled?: boolean;
}) {
	const { zoneId, startTs, endTs, variableKeys, enabled = true } = params;

	return useQuery<ZoneAnalysis>({
		queryKey: insightsKeys.analysis({ zoneId, startTs, endTs, variableKeys }),
		queryFn: () =>
			getZoneAnalysis({
				zoneId: zoneId!,
				startTs,
				endTs,
				variableKeys,
			}),
		enabled: enabled && zoneId != null,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

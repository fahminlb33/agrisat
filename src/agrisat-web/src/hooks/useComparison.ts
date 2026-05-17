import { useQuery } from "@tanstack/react-query";
import { compareZones } from "#/services/api";
import type { ComparisonResult } from "#/types/api";

/**
 * Query key factory for comparison queries.
 */
export const comparisonKeys = {
	all: ["comparison"] as const,
	zones: (params: {
		zoneA: number | null;
		zoneB: number | null;
		startTs: Date;
		endTs: Date;
		variableKeys?: string[];
	}) =>
		[
			...comparisonKeys.all,
			"zones",
			params.zoneA,
			params.zoneB,
			params.startTs.toISOString(),
			params.endTs.toISOString(),
			params.variableKeys,
		] as const,
};

/**
 * Fetches comparison results between two zones.
 *
 * - Validates response with Zod schema (Requirement 11.5)
 * - Stale time: 5 minutes for time series data (stale-while-revalidate)
 * - Only enabled when both zoneA and zoneB are provided
 */
export function useComparison(params: {
	zoneA: number | null;
	zoneB: number | null;
	startTs: Date;
	endTs: Date;
	variableKeys?: string[];
	enabled?: boolean;
}) {
	const { zoneA, zoneB, startTs, endTs, variableKeys, enabled = true } = params;

	return useQuery<ComparisonResult>({
		queryKey: comparisonKeys.zones({ zoneA, zoneB, startTs, endTs, variableKeys }),
		queryFn: () =>
			compareZones({
				zoneA: zoneA!,
				zoneB: zoneB!,
				startTs,
				endTs,
				variableKeys,
			}),
		enabled: enabled && zoneA != null && zoneB != null,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

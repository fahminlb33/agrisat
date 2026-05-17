import { useQuery } from "@tanstack/react-query";
import { getEnvironmentalTimeSeries } from "#/services/api";
import type { EnvironmentalTimePoint } from "#/types/api";

/**
 * Query key factory for environmental data queries.
 */
export const environmentalKeys = {
	all: ["environmental"] as const,
	timeSeries: (params: {
		levelId?: number | null;
		zoneId?: number | null;
		startTs: Date;
		endTs: Date;
	}) =>
		[
			...environmentalKeys.all,
			"timeSeries",
			params.levelId,
			params.zoneId,
			params.startTs.toISOString(),
			params.endTs.toISOString(),
		] as const,
};

/**
 * Fetches environmental time series data for a zone or level.
 *
 * - Validates response with Zod schema (Requirement 11.5)
 * - Stale time: 5 minutes for time series data (stale-while-revalidate)
 * - Only enabled when at least one of zoneId or levelId is provided
 */
export function useEnvironmentalData(params: {
	levelId?: number | null;
	zoneId?: number | null;
	startTs: Date;
	endTs: Date;
	enabled?: boolean;
}) {
	const { levelId, zoneId, startTs, endTs, enabled = true } = params;

	return useQuery<EnvironmentalTimePoint[]>({
		queryKey: environmentalKeys.timeSeries({ levelId, zoneId, startTs, endTs }),
		queryFn: () =>
			getEnvironmentalTimeSeries({
				levelId: levelId ?? undefined,
				zoneId: zoneId ?? undefined,
				startTs,
				endTs,
			}),
		enabled: enabled && (zoneId != null || levelId != null),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

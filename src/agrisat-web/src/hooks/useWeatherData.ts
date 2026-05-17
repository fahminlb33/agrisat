import { useQuery } from "@tanstack/react-query";
import { getWeatherTimeSeries } from "#/services/api";
import type { WeatherTimePoint } from "#/types/api";

/**
 * Query key factory for weather data queries.
 */
export const weatherKeys = {
	all: ["weather"] as const,
	timeSeries: (params: {
		levelId?: number | null;
		zoneId?: number | null;
		startTs: Date;
		endTs: Date;
	}) =>
		[
			...weatherKeys.all,
			"timeSeries",
			params.levelId,
			params.zoneId,
			params.startTs.toISOString(),
			params.endTs.toISOString(),
		] as const,
};

/**
 * Fetches weather time series data for a zone or level.
 *
 * - Validates response with Zod schema (Requirement 11.5)
 * - Stale time: 5 minutes for time series data (stale-while-revalidate)
 * - Only enabled when at least one of zoneId or levelId is provided
 */
export function useWeatherData(params: {
	levelId?: number | null;
	zoneId?: number | null;
	startTs: Date;
	endTs: Date;
	enabled?: boolean;
}) {
	const { levelId, zoneId, startTs, endTs, enabled = true } = params;

	return useQuery<WeatherTimePoint[]>({
		queryKey: weatherKeys.timeSeries({ levelId, zoneId, startTs, endTs }),
		queryFn: () =>
			getWeatherTimeSeries({
				levelId: levelId ?? undefined,
				zoneId: zoneId ?? undefined,
				startTs,
				endTs,
			}),
		enabled: enabled && (zoneId != null || levelId != null),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

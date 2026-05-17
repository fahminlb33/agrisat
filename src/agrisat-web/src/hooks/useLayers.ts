import { useQuery } from "@tanstack/react-query";
import { listLevels, listZones, listVariables } from "#/services/api";
import type { Level, Zone, Variable } from "#/services/api";

/**
 * Query key factory for layer queries.
 */
export const layerKeys = {
	all: ["layers"] as const,
	levels: () => [...layerKeys.all, "levels"] as const,
	zones: (levelId?: number | null) =>
		[...layerKeys.all, "zones", levelId] as const,
	variables: () => [...layerKeys.all, "variables"] as const,
};

/**
 * Fetches available zone levels.
 *
 * - Stale time: Infinity (polygons/levels rarely change)
 * - Requirement 10.4: stale-while-revalidate caching (polygons: indefinite)
 */
export function useLevels() {
	return useQuery<Level[]>({
		queryKey: layerKeys.levels(),
		queryFn: listLevels,
		staleTime: Infinity, // Polygons/levels are static, cache indefinitely
	});
}

/**
 * Fetches zones, optionally filtered by level.
 *
 * - Stale time: Infinity (zone definitions rarely change)
 * - Requirement 10.4: stale-while-revalidate caching (polygons: indefinite)
 */
export function useZones(params?: { levelId?: number | null; enabled?: boolean }) {
	const { levelId, enabled = true } = params ?? {};

	return useQuery<Zone[]>({
		queryKey: layerKeys.zones(levelId),
		queryFn: () => listZones({ levelId: levelId ?? undefined }),
		enabled,
		staleTime: Infinity, // Zone definitions are static, cache indefinitely
	});
}

/**
 * Fetches available variables.
 *
 * - Stale time: Infinity (variable definitions rarely change)
 */
export function useVariables() {
	return useQuery<Variable[]>({
		queryKey: layerKeys.variables(),
		queryFn: listVariables,
		staleTime: Infinity, // Variable definitions are static, cache indefinitely
	});
}

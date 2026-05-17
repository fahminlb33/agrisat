import type { UseQueryResult } from "@tanstack/react-query";
import type { ErrorVariant } from "#/components/ErrorState";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface QueryErrorState {
	/** Whether the query is in an error state (after retries exhausted) */
	hasError: boolean;
	/** The appropriate error variant to display */
	variant: ErrorVariant;
	/** Whether the displayed data is stale (cached during network failure) */
	isStale: boolean;
	/** Retry function to re-trigger the query */
	retry: () => void;
	/** Whether there is cached data available to show */
	hasCachedData: boolean;
}

// -----------------------------------------------------------
// Hook
// -----------------------------------------------------------

/**
 * Derives error state information from a TanStack Query result.
 *
 * Handles:
 * - Requirement 10.3: Retry after exhausted retries (ky handles the 3 retries,
 *   TanStack Query surfaces the final error)
 * - Requirement 10.4: Stale data indicator when cached data is available during failure
 * - Requirement 10.6: Error state with retry button when no cached data is available
 *
 * @param query - A TanStack Query result object
 * @param options - Configuration for error variant detection
 */
export function useQueryErrorState<TData>(
	query: UseQueryResult<TData, Error>,
	options?: {
		/** Override the default error variant detection */
		variant?: ErrorVariant;
		/** Custom function to determine if the response indicates "no data" (empty result) */
		isEmpty?: (data: TData | undefined) => boolean;
	},
): QueryErrorState {
	const { variant: variantOverride, isEmpty } = options ?? {};

	const hasError = query.isError;
	const hasCachedData = query.data != null && !isEmpty?.(query.data);
	const isStale = hasError && hasCachedData;

	// Determine the error variant
	let variant: ErrorVariant = variantOverride ?? "network-error";

	if (!variantOverride && hasError) {
		const errorMessage = query.error?.message?.toLowerCase() ?? "";
		if (errorMessage.includes("404") || errorMessage.includes("not found")) {
			variant = "no-satellite-image";
		} else {
			variant = "network-error";
		}
	}

	// Check for empty data (no-data variant)
	if (!hasError && query.isSuccess && isEmpty?.(query.data)) {
		variant = "no-data";
	}

	return {
		hasError,
		variant,
		isStale,
		retry: () => query.refetch(),
		hasCachedData,
	};
}

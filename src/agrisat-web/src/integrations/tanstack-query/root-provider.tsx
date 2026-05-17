import { QueryClient } from "@tanstack/react-query";

/**
 * Creates a QueryClient with AgriSat-specific defaults:
 * - Retry: 3 attempts with exponential backoff (1s base, jitter up to 500ms, max 10s)
 * - Stale time: 5 minutes for time series data (stale-while-revalidate)
 * - GC time: 10 minutes (keep unused data in cache for background refetch)
 *
 * Requirements: 10.3 (retry), 10.4 (stale-while-revalidate caching)
 */
export function getContext() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: 3,
				retryDelay: (attemptIndex) => {
					// Exponential backoff starting at 1s, capped at 10s, with jitter up to 500ms
					const baseDelay = Math.min(1000 * 2 ** attemptIndex, 10000);
					const jitter = Math.random() * 500;
					return baseDelay + jitter;
				},
				staleTime: 5 * 60 * 1000, // 5 minutes default
				gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
				refetchOnWindowFocus: false,
			},
		},
	});

	return {
		queryClient,
	};
}

export default function TanstackQueryProvider() {}

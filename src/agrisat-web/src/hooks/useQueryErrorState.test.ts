/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { useQueryErrorState } from "./useQueryErrorState";
import type { UseQueryResult } from "@tanstack/react-query";

// Helper to create a mock query result
function mockQuery<T>(overrides: Partial<UseQueryResult<T, Error>>): UseQueryResult<T, Error> {
	return {
		data: undefined,
		error: null,
		isError: false,
		isSuccess: false,
		isLoading: false,
		isPending: false,
		isFetching: false,
		isRefetching: false,
		isLoadingError: false,
		isRefetchError: false,
		isStale: false,
		status: "pending",
		fetchStatus: "idle",
		failureCount: 0,
		failureReason: null,
		errorUpdateCount: 0,
		dataUpdatedAt: 0,
		errorUpdatedAt: 0,
		isFetched: false,
		isFetchedAfterMount: false,
		isInitialLoading: false,
		isPlaceholderData: false,
		refetch: vi.fn().mockResolvedValue({ data: undefined }),
		promise: Promise.resolve(undefined as unknown as T),
		...overrides,
	} as unknown as UseQueryResult<T, Error>;
}

describe("useQueryErrorState", () => {
	describe("Requirement 10.3: Error detection after retries exhausted", () => {
		it("should detect error state when query has error", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Network error"),
				data: undefined,
			});

			const result = useQueryErrorState(query);

			expect(result.hasError).toBe(true);
			expect(result.variant).toBe("network-error");
			expect(result.hasCachedData).toBe(false);
			expect(result.isStale).toBe(false);
		});

		it("should provide a retry function", () => {
			const refetch = vi.fn().mockResolvedValue({ data: [] });
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Network error"),
				refetch,
			});

			const result = useQueryErrorState(query);
			result.retry();

			expect(refetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("Requirement 10.4: Stale data during network failure", () => {
		it("should indicate stale data when cached data exists during error", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Network error"),
				data: ["cached-item"],
			});

			const result = useQueryErrorState(query);

			expect(result.hasError).toBe(true);
			expect(result.isStale).toBe(true);
			expect(result.hasCachedData).toBe(true);
		});

		it("should not indicate stale when isEmpty returns true for cached data", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Network error"),
				data: [],
			});

			const result = useQueryErrorState(query, {
				isEmpty: (data) => !data || data.length === 0,
			});

			expect(result.isStale).toBe(false);
			expect(result.hasCachedData).toBe(false);
		});
	});

	describe("Requirement 10.1: 404 raster detection", () => {
		it("should detect 404 errors as no-satellite-image variant", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Request failed with status 404"),
			});

			const result = useQueryErrorState(query);

			expect(result.variant).toBe("no-satellite-image");
		});
	});

	describe("Requirement 10.2: No data variant", () => {
		it("should detect empty successful response as no-data variant", () => {
			const query = mockQuery<string[]>({
				isError: false,
				isSuccess: true,
				data: [],
			});

			const result = useQueryErrorState(query, {
				isEmpty: (data) => !data || data.length === 0,
			});

			expect(result.hasError).toBe(false);
			expect(result.variant).toBe("no-data");
		});
	});

	describe("Requirement 10.6: Network error without cached data", () => {
		it("should show network-error variant when no cached data available", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Failed to fetch"),
				data: undefined,
			});

			const result = useQueryErrorState(query);

			expect(result.hasError).toBe(true);
			expect(result.variant).toBe("network-error");
			expect(result.hasCachedData).toBe(false);
			expect(result.isStale).toBe(false);
		});
	});

	describe("Variant override", () => {
		it("should use variant override when provided", () => {
			const query = mockQuery<string[]>({
				isError: true,
				error: new Error("Something"),
			});

			const result = useQueryErrorState(query, { variant: "generic" });

			expect(result.variant).toBe("generic");
		});
	});

	describe("No error state", () => {
		it("should report no error when query is successful with data", () => {
			const query = mockQuery<string[]>({
				isError: false,
				isSuccess: true,
				data: ["item1", "item2"],
			});

			const result = useQueryErrorState(query);

			expect(result.hasError).toBe(false);
			expect(result.isStale).toBe(false);
		});
	});
});

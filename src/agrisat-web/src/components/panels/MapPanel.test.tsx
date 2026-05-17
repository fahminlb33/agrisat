/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import MapPanel, {
	type MapPanelProps,
	computeZoneAverages,
	getHeatmapColor,
	getVariableKey,
} from "./MapPanel";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import type { StoreApi } from "zustand/vanilla";
import type { QueryContextStore } from "#/stores/query-context";
import type { EnvironmentalTimePoint } from "#/types/api";

// -----------------------------------------------------------
// Mock window.matchMedia for jsdom
// -----------------------------------------------------------

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// -----------------------------------------------------------
// Mock #/components/ui/map (the Map component uses MapLibre GL internally)
// -----------------------------------------------------------

vi.mock("#/components/ui/map", () => {
	const React = require("react");
	const MockMap = React.forwardRef(function MockMap({ children }: any, _ref: any) {
		return <div data-testid="mock-map">{children}</div>;
	});
	function MockMapControls() {
		return <div data-testid="mock-map-controls" />;
	}
	return {
		Map: MockMap,
		MapControls: MockMapControls,
	};
});

vi.mock("maplibre-gl", () => ({
	default: {
		Map: vi.fn(),
		Marker: vi.fn(),
		Popup: vi.fn(),
	},
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// -----------------------------------------------------------
// Mock API client
// -----------------------------------------------------------

const mockBlobFn = vi.fn();
const mockJsonFn = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetFn = vi.fn((..._args: any[]) => ({
	json: mockJsonFn,
	blob: mockBlobFn,
	ok: true,
	status: 200,
}));

vi.mock("#/services/api", () => ({
	httpClient: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		get: (...args: any[]) => mockGetFn(...args),
	},
}));

// -----------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------

const TEST_GEOJSON = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { zone_id: 1, name: "North Field" },
			geometry: {
				type: "Polygon",
				coordinates: [[[107.5, -6.8], [107.6, -6.8], [107.6, -6.9], [107.5, -6.9], [107.5, -6.8]]],
			},
		},
		{
			type: "Feature",
			properties: { zone_id: 2, name: "South Field" },
			geometry: {
				type: "Polygon",
				coordinates: [[[107.6, -6.9], [107.7, -6.9], [107.7, -7.0], [107.6, -7.0], [107.6, -6.9]]],
			},
		},
	],
};

function createTestStore(): StoreApi<QueryContextStore> {
	const registry: ZoneLevelRegistry = new Map([
		[1, 1],
		[2, 1],
		[3, 2],
	]);
	return createQueryContextStore(registry);
}

function renderPanel(overrides?: Partial<MapPanelProps>) {
	const store = overrides?.store ?? createTestStore();
	const props: MapPanelProps = {
		store,
		...overrides,
	};
	const result = render(<MapPanel {...props} />);
	return { ...result, store };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockJsonFn.mockResolvedValue(TEST_GEOJSON);
	mockBlobFn.mockResolvedValue(new Blob(["fake-image"], { type: "image/webp" }));
});

afterEach(() => {
	cleanup();
});

// -----------------------------------------------------------
// Tests
// -----------------------------------------------------------

describe("MapPanel", () => {
	describe("Requirement 2.1: Render zone polygons for selected level", () => {
		it("should show empty state when no level is selected", () => {
			renderPanel();

			expect(
				screen.getByText("Select a level to view zones on the map"),
			).toBeTruthy();
		});

		it("should fetch polygons when level is selected", async () => {
			const store = createTestStore();
			store.getState().setLevel(1);

			renderPanel({ store });

			// Wait for the async fetch to complete
			await waitFor(() => {
				expect(mockGetFn).toHaveBeenCalledWith("layers/polygons", {
					searchParams: { level_id: 1 },
				});
			});
		});

		it("should not show empty state when level is selected", async () => {
			const store = createTestStore();
			store.getState().setLevel(1);

			renderPanel({ store });

			expect(
				screen.queryByText("Select a level to view zones on the map"),
			).toBeNull();
		});
	});

	describe("Requirement 2.8: Raster unavailable fallback", () => {
		it("should display fallback message when raster returns 404", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(mockGetFn as any).mockImplementation((...args: any[]) => {
				const url = args[0] as string;
				if (url === "layers/rasters") {
					return Promise.resolve({
						ok: false,
						status: 404,
						json: vi.fn(),
						blob: vi.fn(),
					});
				}
				return Promise.resolve({
					json: () => Promise.resolve(TEST_GEOJSON),
					blob: mockBlobFn,
					ok: true,
					status: 200,
				});
			});

			const store = createTestStore();
			store.getState().setLevel(1);
			store.getState().toggleVariable(1);
			store.getState().setActiveVariable(1);

			renderPanel({ store });

			await waitFor(() => {
				expect(
					screen.getByText("No satellite image available for the selected date"),
				).toBeTruthy();
			});
		});

		it("should not display fallback message when no active variable", () => {
			const store = createTestStore();
			store.getState().setLevel(1);

			renderPanel({ store });

			expect(
				screen.queryByText("No satellite image available for the selected date"),
			).toBeNull();
		});
	});

	describe("Requirement 2.7: Raster update on time_range change", () => {
		it("should fetch raster with latest timestamp from time range", async () => {
			const store = createTestStore();
			store.getState().setLevel(1);
			store.getState().toggleVariable(1);
			store.getState().setActiveVariable(1);

			renderPanel({ store });

			await waitFor(() => {
				const rasterCalls = mockGetFn.mock.calls.filter(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(call: any[]) => call[0] === "layers/rasters",
				);
				expect(rasterCalls.length).toBeGreaterThan(0);
				// Should use endTs from time range
				const searchParams = rasterCalls[0]![1]?.searchParams;
				expect(searchParams?.variable_id).toBe(1);
				expect(searchParams?.ts).toBeDefined();
			});
		});

		it("should re-fetch raster when time range changes", async () => {
			const store = createTestStore();
			store.getState().setLevel(1);
			store.getState().toggleVariable(1);
			store.getState().setActiveVariable(1);

			const { rerender } = renderPanel({ store });

			await waitFor(() => {
				const rasterCalls = mockGetFn.mock.calls.filter(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(call: any[]) => call[0] === "layers/rasters",
				);
				expect(rasterCalls.length).toBeGreaterThan(0);
			});

			// Change time range
			const newStart = new Date("2024-01-01");
			const newEnd = new Date("2024-02-01");
			store.getState().setTimeRange(newStart, newEnd);

			rerender(<MapPanel store={store} />);

			await waitFor(() => {
				const rasterCalls = mockGetFn.mock.calls.filter(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(call: any[]) => call[0] === "layers/rasters",
				);
				// Should have been called again with new time range
				expect(rasterCalls.length).toBeGreaterThanOrEqual(2);
				const lastCall = rasterCalls[rasterCalls.length - 1]!;
				expect(lastCall[1]?.searchParams?.ts).toBe("2024-02-01");
			});
		});
	});

	describe("Error handling", () => {
		it("should display error message when polygon fetch fails", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(mockGetFn as any).mockImplementation((...args: any[]) => {
				const url = args[0] as string;
				if (url === "layers/polygons") {
					return { json: () => Promise.reject(new Error("Network error")) };
				}
				return { json: mockJsonFn, ok: true, status: 200 };
			});

			const store = createTestStore();
			store.getState().setLevel(1);

			renderPanel({ store });

			await waitFor(() => {
				expect(
					screen.getByText("Failed to load zone polygons."),
				).toBeTruthy();
			});
		});
	});

	describe("Level change behavior", () => {
		it("should clear error and show empty state when level is reset", async () => {
			const store = createTestStore();
			store.getState().setLevel(1);

			const { rerender } = renderPanel({ store });

			// Reset the store (sets levelId to null)
			store.getState().reset();

			rerender(<MapPanel store={store} />);

			await waitFor(() => {
				expect(
					screen.getByText("Select a level to view zones on the map"),
				).toBeTruthy();
			});
		});
	});
});

// -----------------------------------------------------------
// Unit tests for utility functions
// -----------------------------------------------------------

describe("MapPanel utilities", () => {
	describe("computeZoneAverages", () => {
		it("should compute averages per zone for a given variable", () => {
			const data: EnvironmentalTimePoint[] = [
				{ timestamp: "2024-01-01", zone_id: 1, zone_name: "A", zone_city: "X", level_id: 1, level: "field", ndvi: 0.6, gndvi: 0.5, wdrvi: 0.4, msavi: 0.3, ndre: 0.2, cire: 0.1, ndmi: 0.5, ndwi: 0.4 },
				{ timestamp: "2024-01-02", zone_id: 1, zone_name: "A", zone_city: "X", level_id: 1, level: "field", ndvi: 0.8, gndvi: 0.5, wdrvi: 0.4, msavi: 0.3, ndre: 0.2, cire: 0.1, ndmi: 0.5, ndwi: 0.4 },
				{ timestamp: "2024-01-01", zone_id: 2, zone_name: "B", zone_city: "Y", level_id: 1, level: "field", ndvi: 0.4, gndvi: 0.5, wdrvi: 0.4, msavi: 0.3, ndre: 0.2, cire: 0.1, ndmi: 0.5, ndwi: 0.4 },
			];

			const result = computeZoneAverages(data, "ndvi");

			expect(result).toHaveLength(2);
			const zone1 = result.find((z) => z.zoneId === 1);
			const zone2 = result.find((z) => z.zoneId === 2);
			expect(zone1?.average).toBeCloseTo(0.7);
			expect(zone2?.average).toBeCloseTo(0.4);
		});

		it("should return empty array for invalid variable key", () => {
			const data: EnvironmentalTimePoint[] = [
				{ timestamp: "2024-01-01", zone_id: 1, zone_name: "A", zone_city: "X", level_id: 1, level: "field", ndvi: 0.6, gndvi: 0.5, wdrvi: 0.4, msavi: 0.3, ndre: 0.2, cire: 0.1, ndmi: 0.5, ndwi: 0.4 },
			];

			const result = computeZoneAverages(data, "nonexistent");
			expect(result).toHaveLength(0);
		});
	});

	describe("getHeatmapColor", () => {
		it("should return a valid rgba color string", () => {
			const color = getHeatmapColor(0.5);
			expect(color).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
		});

		it("should clamp values below 0", () => {
			const color = getHeatmapColor(-0.5);
			const colorAtZero = getHeatmapColor(0);
			expect(color).toBe(colorAtZero);
		});

		it("should clamp values above 1", () => {
			const color = getHeatmapColor(1.5);
			const colorAtOne = getHeatmapColor(1);
			expect(color).toBe(colorAtOne);
		});
	});

	describe("getVariableKey", () => {
		it("should return correct key for known variable IDs", () => {
			expect(getVariableKey(1)).toBe("ndvi");
			expect(getVariableKey(7)).toBe("ndmi");
		});

		it("should return ndvi as default for unknown variable IDs", () => {
			expect(getVariableKey(999)).toBe("ndvi");
		});
	});
});

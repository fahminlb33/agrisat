/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AnalysisPanel, {
	computeZoneMetrics,
	computeTrend,
	computeWeatherSummary,
	type AnalysisPanelProps,
	type EnvironmentalTimePoint,
	type WeatherTimePoint,
	type ZoneInfo,
	type DataSourceAttribution,
} from "./AnalysisPanel";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import type { StoreApi } from "zustand/vanilla";
import type { QueryContextStore } from "#/stores/query-context";
import type { ZoneInsight, ComparisonResult } from "#/types/api";

// -----------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------

function makeEnvPoint(overrides: Partial<EnvironmentalTimePoint> = {}): EnvironmentalTimePoint {
	return {
		timestamp: "2024-01-15",
		zone_id: 1,
		zone_name: "North Field",
		zone_city: "Springfield",
		level_id: 1,
		level: "Farm",
		ndvi: 0.65,
		gndvi: 0.55,
		wdrvi: 0.3,
		msavi: 0.5,
		ndre: 0.4,
		cire: 0.35,
		ndmi: 0.2,
		ndwi: -0.1,
		...overrides,
	};
}

function makeWeatherPoint(overrides: Partial<WeatherTimePoint> = {}): WeatherTimePoint {
	return {
		timestamp: "2024-01-15",
		zone_id: 1,
		zone_name: "North Field",
		zone_city: "Springfield",
		level_id: 1,
		level: "Farm",
		temperature: 25.0,
		precipitation: 5.0,
		cloud_cover_pct: 40.0,
		is_raining: false,
		...overrides,
	};
}

const TEST_ZONE_INFO: ZoneInfo = {
	zoneId: 1,
	zoneName: "North Field",
	level: "Farm",
	city: "Springfield",
};

function createTestStore(): StoreApi<QueryContextStore> {
	const registry: ZoneLevelRegistry = new Map([
		[1, 1],
		[2, 1],
	]);
	const store = createQueryContextStore(registry);
	// Set up a valid state with level and zone selected
	store.getState().setLevel(1);
	store.getState().setZone(1);
	store.getState().toggleVariable(1);
	return store;
}

function renderPanel(overrides?: Partial<AnalysisPanelProps>) {
	const store = overrides?.store ?? createTestStore();
	const props: AnalysisPanelProps = {
		store,
		environmentalData: [],
		weatherData: [],
		zoneInfo: TEST_ZONE_INFO,
		...overrides,
	};
	const result = render(<AnalysisPanel {...props} />);
	return { ...result, store };
}

afterEach(() => {
	cleanup();
});

// -----------------------------------------------------------
// Unit tests for computeZoneMetrics
// -----------------------------------------------------------

describe("computeZoneMetrics", () => {
	it("should return null for empty time series", () => {
		const result = computeZoneMetrics([], "ndvi");
		expect(result).toBeNull();
	});

	it("should compute correct metrics for a single data point", () => {
		const data = [makeEnvPoint({ ndvi: 0.7 })];
		const result = computeZoneMetrics(data, "ndvi");

		expect(result).not.toBeNull();
		expect(result!.current).toBe(0.7);
		expect(result!.average).toBe(0.7);
		expect(result!.min).toBe(0.7);
		expect(result!.max).toBe(0.7);
		// Single point: trend should be stable
		expect(result!.trend).toBe("stable");
		expect(result!.trendMagnitude).toBe(0);
	});

	it("should compute correct metrics for multiple data points", () => {
		const data = [
			makeEnvPoint({ ndvi: 0.5, timestamp: "2024-01-01" }),
			makeEnvPoint({ ndvi: 0.6, timestamp: "2024-01-05" }),
			makeEnvPoint({ ndvi: 0.7, timestamp: "2024-01-10" }),
			makeEnvPoint({ ndvi: 0.8, timestamp: "2024-01-15" }),
		];
		const result = computeZoneMetrics(data, "ndvi");

		expect(result).not.toBeNull();
		expect(result!.current).toBe(0.8); // last value
		expect(result!.average).toBeCloseTo(0.65, 5); // (0.5+0.6+0.7+0.8)/4
		expect(result!.min).toBe(0.5);
		expect(result!.max).toBe(0.8);
		expect(result!.trend).toBe("increasing");
		expect(result!.trendMagnitude).toBeGreaterThan(0);
	});

	it("should detect decreasing trend", () => {
		const data = [
			makeEnvPoint({ ndvi: 0.8, timestamp: "2024-01-01" }),
			makeEnvPoint({ ndvi: 0.6, timestamp: "2024-01-05" }),
			makeEnvPoint({ ndvi: 0.4, timestamp: "2024-01-10" }),
			makeEnvPoint({ ndvi: 0.2, timestamp: "2024-01-15" }),
		];
		const result = computeZoneMetrics(data, "ndvi");

		expect(result).not.toBeNull();
		expect(result!.trend).toBe("decreasing");
		expect(result!.trendMagnitude).toBeLessThan(0);
	});

	it("should detect stable trend for constant values", () => {
		const data = [
			makeEnvPoint({ ndvi: 0.5, timestamp: "2024-01-01" }),
			makeEnvPoint({ ndvi: 0.5, timestamp: "2024-01-05" }),
			makeEnvPoint({ ndvi: 0.5, timestamp: "2024-01-10" }),
		];
		const result = computeZoneMetrics(data, "ndvi");

		expect(result).not.toBeNull();
		expect(result!.trend).toBe("stable");
		expect(result!.trendMagnitude).toBe(0);
	});

	it("should ensure min <= average <= max", () => {
		const data = [
			makeEnvPoint({ ndvi: 0.3 }),
			makeEnvPoint({ ndvi: 0.9 }),
			makeEnvPoint({ ndvi: 0.5 }),
			makeEnvPoint({ ndvi: 0.7 }),
		];
		const result = computeZoneMetrics(data, "ndvi");

		expect(result).not.toBeNull();
		expect(result!.min).toBeLessThanOrEqual(result!.average);
		expect(result!.average).toBeLessThanOrEqual(result!.max);
	});
});

// -----------------------------------------------------------
// Unit tests for computeTrend
// -----------------------------------------------------------

describe("computeTrend", () => {
	it("should return stable for fewer than 2 values", () => {
		const result = computeTrend([0.5]);
		expect(result.direction).toBe("stable");
		expect(result.magnitude).toBe(0);
	});

	it("should detect increasing trend", () => {
		const result = computeTrend([0.1, 0.3, 0.5, 0.7, 0.9]);
		expect(result.direction).toBe("increasing");
		expect(result.magnitude).toBeGreaterThan(0);
	});

	it("should detect decreasing trend", () => {
		const result = computeTrend([0.9, 0.7, 0.5, 0.3, 0.1]);
		expect(result.direction).toBe("decreasing");
		expect(result.magnitude).toBeLessThan(0);
	});

	it("should detect stable trend for constant values", () => {
		const result = computeTrend([0.5, 0.5, 0.5, 0.5]);
		expect(result.direction).toBe("stable");
		expect(result.magnitude).toBe(0);
	});

	it("should detect stable trend for very small slope", () => {
		const result = computeTrend([0.5, 0.5001, 0.5002, 0.5003]);
		expect(result.direction).toBe("stable");
	});
});

// -----------------------------------------------------------
// Unit tests for computeWeatherSummary
// -----------------------------------------------------------

describe("computeWeatherSummary", () => {
	it("should return nulls for empty data", () => {
		const result = computeWeatherSummary([]);
		expect(result.currentTemperature).toBeNull();
		expect(result.avgTemperature).toBeNull();
		expect(result.totalPrecipitation).toBeNull();
		expect(result.avgCloudCover).toBeNull();
	});

	it("should compute correct weather summary", () => {
		const data = [
			makeWeatherPoint({ temperature: 20, precipitation: 5, cloud_cover_pct: 30 }),
			makeWeatherPoint({ temperature: 25, precipitation: 10, cloud_cover_pct: 50 }),
			makeWeatherPoint({ temperature: 30, precipitation: 0, cloud_cover_pct: 20 }),
		];
		const result = computeWeatherSummary(data);

		expect(result.currentTemperature).toBe(30); // last value
		expect(result.avgTemperature).toBe(25); // (20+25+30)/3
		expect(result.totalPrecipitation).toBe(15); // 5+10+0
		expect(result.avgCloudCover).toBeCloseTo(33.33, 1); // (30+50+20)/3
	});
});

// -----------------------------------------------------------
// Component rendering tests
// -----------------------------------------------------------

describe("AnalysisPanel", () => {
	describe("Requirement 5.4: Empty state (no zone selected)", () => {
		it("should display message when no zone is selected", () => {
			const registry: ZoneLevelRegistry = new Map([[1, 1]]);
			const store = createQueryContextStore(registry);
			// Don't set zone
			renderPanel({ store, zoneInfo: null });

			expect(screen.getByText("Select a zone to view analysis")).toBeTruthy();
		});
	});

	describe("Requirement 5.4: Empty state (no data)", () => {
		it("should display no-data message when environmental and weather data are empty", () => {
			renderPanel({ environmentalData: [], weatherData: [] });

			expect(
				screen.getByText(/No data available for the selected zone and time range/),
			).toBeTruthy();
		});
	});

	describe("Requirement 5.5: Zone name, level, city display", () => {
		it("should display zone name, level, and city", () => {
			const envData = [
				makeEnvPoint({ timestamp: "2024-01-01" }),
				makeEnvPoint({ timestamp: "2024-01-05" }),
			];
			renderPanel({ environmentalData: envData });

			expect(screen.getByText("North Field")).toBeTruthy();
			expect(screen.getByText("Farm · Springfield")).toBeTruthy();
		});
	});

	describe("Requirement 5.1: Metrics display (current, average, min, max)", () => {
		it("should display metrics for environmental variables", () => {
			const envData = [
				makeEnvPoint({ ndvi: 0.5, timestamp: "2024-01-01" }),
				makeEnvPoint({ ndvi: 0.7, timestamp: "2024-01-05" }),
			];
			renderPanel({ environmentalData: envData });

			// Should show NDVI label
			expect(screen.getByText("NDVI")).toBeTruthy();
			// Should show metric labels
			expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
			expect(screen.getAllByText("Average").length).toBeGreaterThan(0);
			expect(screen.getAllByText("Min").length).toBeGreaterThan(0);
			expect(screen.getAllByText("Max").length).toBeGreaterThan(0);
		});
	});

	describe("Requirement 5.3: Trend display", () => {
		it("should display trend direction when 2+ data points exist", () => {
			const envData = [
				makeEnvPoint({ ndvi: 0.3, gndvi: 0.3, wdrvi: 0.3, msavi: 0.3, ndre: 0.3, cire: 0.3, ndmi: 0.3, ndwi: 0.3, timestamp: "2024-01-01" }),
				makeEnvPoint({ ndvi: 0.8, gndvi: 0.8, wdrvi: 0.8, msavi: 0.8, ndre: 0.8, cire: 0.8, ndmi: 0.8, ndwi: 0.8, timestamp: "2024-01-15" }),
			];
			renderPanel({ environmentalData: envData });

			// Should show increasing trend indicators
			const trendLabels = screen.getAllByLabelText("Trend: increasing");
			expect(trendLabels.length).toBeGreaterThan(0);
		});
	});

	describe("Requirement 5.6: Single data point state", () => {
		it("should indicate trend cannot be computed with single data point", () => {
			const envData = [makeEnvPoint({ ndvi: 0.5 })];
			renderPanel({ environmentalData: envData });

			expect(
				screen.getByText(/Only 1 data point available — trend cannot be computed/),
			).toBeTruthy();
			// Should show "No trend" instead of trend direction
			const noTrendLabels = screen.getAllByLabelText("Trend unavailable");
			expect(noTrendLabels.length).toBeGreaterThan(0);
		});
	});

	describe("Requirement 6.1, 6.2: Weather data display with units", () => {
		it("should display weather data with correct units", () => {
			const envData = [makeEnvPoint()];
			const weatherData = [
				makeWeatherPoint({ temperature: 25.5, precipitation: 12.3, cloud_cover_pct: 45.0 }),
			];
			renderPanel({ environmentalData: envData, weatherData });

			expect(screen.getByText("Weather")).toBeTruthy();
			// With a single weather point, current and avg are the same, so use getAllByText
			expect(screen.getAllByText("25.5 °C").length).toBeGreaterThan(0);
			expect(screen.getByText("12.3 mm")).toBeTruthy();
			expect(screen.getByText("45.0 %")).toBeTruthy();
		});
	});

	describe("Requirement 6.5: No weather data", () => {
		it("should not display weather section when no weather data exists", () => {
			const envData = [makeEnvPoint()];
			renderPanel({ environmentalData: envData, weatherData: [] });

			expect(screen.queryByText("Weather Summary")).toBeNull();
		});
	});

	describe("Requirement 7.3, 7.4, 7.6: Insights display sorted by severity", () => {
		it("should display insights sorted by severity (critical > warning > info)", () => {
			const envData = [makeEnvPoint()];
			const insights: ZoneInsight[] = [
				{
					type: "trend",
					severity: "info",
					title: "NDVI is increasing",
					description: "North Field: NDVI shows an increasing trend.",
					variable_key: "ndvi",
					zone_id: 1,
				},
				{
					type: "anomaly",
					severity: "critical",
					title: "Abnormal drop in NDMI",
					description: "North Field: Detected abnormal drop in NDMI.",
					variable_key: "ndmi",
					zone_id: 1,
				},
				{
					type: "trend",
					severity: "warning",
					title: "GNDVI is decreasing",
					description: "North Field: GNDVI shows a decreasing trend.",
					variable_key: "gndvi",
					zone_id: 1,
				},
			];
			renderPanel({ environmentalData: envData, insights });

			// All insights should be displayed
			expect(screen.getByText("Abnormal drop in NDMI")).toBeTruthy();
			expect(screen.getByText("GNDVI is decreasing")).toBeTruthy();
			expect(screen.getByText("NDVI is increasing")).toBeTruthy();

			// Severity badges should be present
			expect(screen.getByLabelText("Severity: critical")).toBeTruthy();
			expect(screen.getByLabelText("Severity: warning")).toBeTruthy();
			expect(screen.getByLabelText("Severity: info")).toBeTruthy();
		});

		it("should display the Insights section heading", () => {
			const envData = [makeEnvPoint()];
			const insights: ZoneInsight[] = [
				{
					type: "data_gap",
					severity: "info",
					title: "Data gap detected",
					description: "No data between 2024-01-01 and 2024-01-15.",
					variable_key: null,
					zone_id: 1,
				},
			];
			renderPanel({ environmentalData: envData, insights });

			expect(screen.getByText("Insights")).toBeTruthy();
		});

		it("should not display insights section when insights array is empty", () => {
			const envData = [makeEnvPoint()];
			renderPanel({ environmentalData: envData, insights: [] });

			expect(screen.queryByText("Insights")).toBeNull();
		});
	});

	describe("Requirement 8.2, 8.5: Comparison view with deltas", () => {
		it("should display comparison view with side-by-side metrics and deltas", () => {
			const envData = [makeEnvPoint()];
			const comparisonResult: ComparisonResult = {
				type: "zone",
				target_a: { zone_id: 1 },
				target_b: { zone_id: 2 },
				metrics_a: [
					{ variable_key: "ndvi", current: 0.7, average: 0.65, min_val: 0.5, max_val: 0.8, trend: "increasing", trend_magnitude: 0.002 },
				],
				metrics_b: [
					{ variable_key: "ndvi", current: 0.5, average: 0.45, min_val: 0.3, max_val: 0.6, trend: "stable", trend_magnitude: 0.0001 },
				],
				deltas: [
					{
						variable_key: "ndvi",
						value_a: 0.65,
						value_b: 0.45,
						absolute_diff: 0.2,
						relative_diff_pct: 44.4,
						interpretation: "North Field is 44.4% higher than South Field",
					},
				],
			};

			// Need to enable comparison mode in the store
			const registry: ZoneLevelRegistry = new Map([[1, 1], [2, 1]]);
			const store = createQueryContextStore(registry);
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().toggleVariable(1);
			store.getState().enableComparison({
				type: "zone",
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			});

			renderPanel({
				store,
				environmentalData: envData,
				comparisonResult,
				comparisonTargetAName: "North Field",
				comparisonTargetBName: "South Field",
			});

			// Should show comparison heading
			expect(screen.getByText("Comparison: North Field vs South Field")).toBeTruthy();
			// Should show target names in comparison delta rows
			expect(screen.getAllByText("North Field").length).toBeGreaterThanOrEqual(2); // zone header + comparison
			expect(screen.getByText("South Field")).toBeTruthy();
			// Should show absolute and relative differences
			expect(screen.getByText("+0.2000")).toBeTruthy();
			expect(screen.getByText("+44.4%")).toBeTruthy();
			// Should show interpretation
			expect(screen.getByText("North Field is 44.4% higher than South Field")).toBeTruthy();
		});
	});

	describe("Requirement 8.7: Missing data in comparison", () => {
		it("should show missing data indication when target_a has no data", () => {
			const envData = [makeEnvPoint()];
			const comparisonResult: ComparisonResult = {
				type: "zone",
				target_a: { zone_id: 1 },
				target_b: { zone_id: 2 },
				metrics_a: [],
				metrics_b: [],
				deltas: [],
			};

			const registry: ZoneLevelRegistry = new Map([[1, 1], [2, 1]]);
			const store = createQueryContextStore(registry);
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().toggleVariable(1);
			store.getState().enableComparison({
				type: "zone",
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			});

			renderPanel({
				store,
				environmentalData: envData,
				comparisonResult,
				comparisonTargetAName: "North Field",
				comparisonTargetBName: "South Field",
				comparisonMissingData: "target_a",
			});

			expect(
				screen.getByText(/No data available for "North Field". Comparison cannot be completed./),
			).toBeTruthy();
		});

		it("should show missing data indication when both targets have no data", () => {
			const envData = [makeEnvPoint()];
			const comparisonResult: ComparisonResult = {
				type: "zone",
				target_a: { zone_id: 1 },
				target_b: { zone_id: 2 },
				metrics_a: [],
				metrics_b: [],
				deltas: [],
			};

			const registry: ZoneLevelRegistry = new Map([[1, 1], [2, 1]]);
			const store = createQueryContextStore(registry);
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().toggleVariable(1);
			store.getState().enableComparison({
				type: "zone",
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			});

			renderPanel({
				store,
				environmentalData: envData,
				comparisonResult,
				comparisonTargetAName: "North Field",
				comparisonTargetBName: "South Field",
				comparisonMissingData: "both",
			});

			expect(
				screen.getByText(/No data available for both "North Field" and "South Field". Comparison cannot be completed./),
			).toBeTruthy();
		});
	});

	describe("Requirement 9.1, 9.2: Data source attribution", () => {
		it("should display satellite name and last observation date", () => {
			const envData = [makeEnvPoint()];
			const dataSource: DataSourceAttribution = {
				satelliteName: "Sentinel-2",
				lastObservationDate: "2024-01-15T10:30:00Z",
			};
			renderPanel({ environmentalData: envData, dataSource });

			expect(screen.getByText("Sentinel-2")).toBeTruthy();
			expect(screen.getByText("2024-01-15T10:30:00Z")).toBeTruthy();
		});

		it("should not display data source footer when dataSource is null", () => {
			const envData = [makeEnvPoint()];
			renderPanel({ environmentalData: envData, dataSource: null });

			expect(screen.queryByText("Source:")).toBeNull();
		});
	});
});

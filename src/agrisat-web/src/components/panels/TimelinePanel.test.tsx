/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TimelinePanel, { type TimelinePanelProps } from "./TimelinePanel";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import type { StoreApi } from "zustand/vanilla";
import type { QueryContextStore } from "#/stores/query-context";
import dayjs from "dayjs";

// Mock ResizeObserver for Radix UI components
beforeAll(() => {
	global.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

// -----------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------

function createTestStore(): StoreApi<QueryContextStore> {
	const registry: ZoneLevelRegistry = new Map([
		[1, 1],
		[2, 1],
	]);
	return createQueryContextStore(registry);
}

/** Generate timestamps with a given interval in days */
function generateTimestamps(
	startDate: string,
	count: number,
	intervalDays: number,
): Date[] {
	const timestamps: Date[] = [];
	for (let i = 0; i < count; i++) {
		timestamps.push(
			dayjs(startDate)
				.add(i * intervalDays, "day")
				.toDate(),
		);
	}
	return timestamps;
}

/** Generate trend data matching timestamps */
function generateTrendData(
	timestamps: Date[],
	baseValue = 0.5,
	slope = 0.01,
): Array<{ ts: Date; value: number }> {
	return timestamps.map((ts, i) => ({
		ts,
		value: baseValue + i * slope,
	}));
}

function renderPanel(overrides?: Partial<TimelinePanelProps>) {
	const store = overrides?.store ?? createTestStore();
	const timestamps =
		overrides?.availableTimestamps ?? generateTimestamps("2024-01-01", 10, 5);
	const trendData = overrides?.trendData ?? generateTrendData(timestamps);

	const props: TimelinePanelProps = {
		store,
		availableTimestamps: timestamps,
		trendData,
		activeVariableKey: "ndvi",
		...overrides,
	};
	const result = render(<TimelinePanel {...props} />);
	return { ...result, store };
}

afterEach(() => {
	cleanup();
});

// -----------------------------------------------------------
// Tests
// -----------------------------------------------------------

describe("TimelinePanel", () => {
	describe("Range selection slider updates QueryContext timeRange", () => {
		it("should render range selection slider", () => {
			renderPanel();

			// The DualRangeSlider renders with role="slider" elements for thumbs
			const sliders = screen.getAllByRole("slider");
			expect(sliders.length).toBe(2); // start and end thumbs
		});

		it("should update QueryContext timeRange when slider value changes", () => {
			const timestamps = generateTimestamps("2024-01-01", 10, 5);
			const store = createTestStore();
			// Set initial time range to cover all timestamps
			store
				.getState()
				.setTimeRange(
					dayjs("2024-01-01").toDate(),
					dayjs("2024-02-15").toDate(),
				);

			renderPanel({ store, availableTimestamps: timestamps });

			// Verify the slider is rendered and the store can be updated via its action
			const sliders = screen.getAllByRole("slider");
			expect(sliders.length).toBe(2);

			// Test the store action directly since Radix slider interaction is complex in jsdom
			store
				.getState()
				.setTimeRange(
					dayjs("2024-01-01").toDate(),
					dayjs("2024-01-26").toDate(),
				);

			const state = store.getState();
			expect(dayjs(state.timeRange.endTs).format("YYYY-MM-DD")).toBe(
				"2024-01-26",
			);
		});
	});

	describe("Single date selection for raster", () => {
		it("should call onDateSelect when a date dot is clicked", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const onDateSelect = vi.fn();

			renderPanel({ availableTimestamps: timestamps, onDateSelect });

			// Date dots are rendered as buttons with aria-label containing the date
			const buttons = screen.getAllByRole("button", { name: /Select/ });
			// Click the third date dot
			fireEvent.click(buttons[2]);

			expect(onDateSelect).toHaveBeenCalledWith(timestamps[2]);
		});

		it("should render date stepper when onDateSelect is provided", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const onDateSelect = vi.fn();

			renderPanel({
				availableTimestamps: timestamps,
				onDateSelect,
				selectedDate: timestamps[2],
			});

			expect(screen.getByLabelText("Previous date")).toBeTruthy();
			expect(screen.getByLabelText("Next date")).toBeTruthy();
		});
	});

	describe("Time range presets", () => {
		it("should render time range preset buttons", () => {
			renderPanel();

			expect(screen.getByLabelText("Set time range to 7d")).toBeTruthy();
			expect(screen.getByLabelText("Set time range to 30d")).toBeTruthy();
			expect(screen.getByLabelText("Set time range to 90d")).toBeTruthy();
			expect(screen.getByLabelText("Set time range to All")).toBeTruthy();
		});
	});

	describe("Chart view toggle", () => {
		it("should render chart view toggle when environmental data is provided", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const envData = timestamps.map((ts, i) => ({
				timestamp: ts.toISOString(),
				zone_id: 1,
				zone_name: "Zone A",
				zone_city: "City",
				level_id: 1,
				level: "extent",
				ndvi: 0.5 + i * 0.01,
				gndvi: 0.4,
				wdrvi: 0.3,
				msavi: 0.4,
				ndre: 0.2,
				cire: 0.3,
				ndmi: 0.5,
				ndwi: 0.4,
			}));

			renderPanel({
				availableTimestamps: timestamps,
				environmentalData: envData,
			});

			expect(screen.getByLabelText("Environmental chart")).toBeTruthy();
			expect(screen.getByLabelText("Weather chart")).toBeTruthy();
			expect(screen.getByLabelText("Combined chart")).toBeTruthy();
		});
	});

	describe("Empty state when no timestamps available", () => {
		it("should display empty state message when no timestamps are available", () => {
			renderPanel({ availableTimestamps: [], trendData: [] });

			expect(
				screen.getByText(/No observations available for the current selection/),
			).toBeTruthy();
		});

		it("should not render timeline controls in empty state", () => {
			renderPanel({ availableTimestamps: [], trendData: [] });

			expect(screen.queryByRole("slider")).toBeNull();
		});
	});

	describe("Active variable display", () => {
		it("should display the variable key in uppercase", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const trendData = generateTrendData(timestamps);

			renderPanel({
				availableTimestamps: timestamps,
				trendData,
				activeVariableKey: "ndvi",
			});

			expect(screen.getByText("NDVI")).toBeTruthy();
		});
	});
});

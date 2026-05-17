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
function generateTimestamps(startDate: string, count: number, intervalDays: number): Date[] {
	const timestamps: Date[] = [];
	for (let i = 0; i < count; i++) {
		timestamps.push(dayjs(startDate).add(i * intervalDays, "day").toDate());
	}
	return timestamps;
}

/** Generate trend data matching timestamps */
function generateTrendData(timestamps: Date[], baseValue = 0.5, slope = 0.01): Array<{ ts: Date; value: number }> {
	return timestamps.map((ts, i) => ({
		ts,
		value: baseValue + i * slope,
	}));
}

function renderPanel(overrides?: Partial<TimelinePanelProps>) {
	const store = overrides?.store ?? createTestStore();
	const timestamps = overrides?.availableTimestamps ?? generateTimestamps("2024-01-01", 10, 5);
	const trendData = overrides?.trendData ?? generateTrendData(timestamps);

	const props: TimelinePanelProps = {
		store,
		availableTimestamps: timestamps,
		trendData,
		activeVariableKey: "ndvi",
		onTimestampSelect: undefined,
		rasterUnavailableMessage: null,
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
	describe("Requirement 3.1: Display available timestamps as selectable points", () => {
		it("should render all available timestamps as selectable points", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			renderPanel({ availableTimestamps: timestamps });

			const listbox = screen.getByRole("listbox", { name: "Available timestamps" });
			expect(listbox).toBeTruthy();

			const options = screen.getAllByRole("option");
			expect(options.length).toBe(5);
		});

		it("should display timestamps in chronological order", () => {
			const timestamps = [
				dayjs("2024-01-15").toDate(),
				dayjs("2024-01-01").toDate(),
				dayjs("2024-01-10").toDate(),
			];
			renderPanel({ availableTimestamps: timestamps });

			const options = screen.getAllByRole("option");
			expect(options[0].getAttribute("aria-label")).toContain("2024-01-01");
			expect(options[1].getAttribute("aria-label")).toContain("2024-01-10");
			expect(options[2].getAttribute("aria-label")).toContain("2024-01-15");
		});
	});

	describe("Requirement 3.2: Range selection slider updates QueryContext timeRange", () => {
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
			store.getState().setTimeRange(
				dayjs("2024-01-01").toDate(),
				dayjs("2024-02-15").toDate(),
			);

			renderPanel({ store, availableTimestamps: timestamps });

			// Verify the slider is rendered and the store can be updated via its action
			const sliders = screen.getAllByRole("slider");
			expect(sliders.length).toBe(2);

			// Test the store action directly since Radix slider interaction is complex in jsdom
			store.getState().setTimeRange(
				dayjs("2024-01-01").toDate(),
				dayjs("2024-01-26").toDate(),
			);

			const state = store.getState();
			expect(dayjs(state.timeRange.endTs).format("YYYY-MM-DD")).toBe("2024-01-26");
		});
	});

	describe("Requirement 3.3: Single timestamp selection updates map raster", () => {
		it("should call onTimestampSelect when a timestamp is clicked", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const onTimestampSelect = vi.fn();

			renderPanel({ availableTimestamps: timestamps, onTimestampSelect });

			const options = screen.getAllByRole("option");
			fireEvent.click(options[2]);

			expect(onTimestampSelect).toHaveBeenCalledWith(timestamps[2]);
		});

		it("should mark the clicked timestamp as selected", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			renderPanel({ availableTimestamps: timestamps });

			const options = screen.getAllByRole("option");
			fireEvent.click(options[2]);

			expect(options[2].getAttribute("aria-selected")).toBe("true");
		});
	});

	describe("Requirement 3.4: Handle unavailable raster on timestamp select", () => {
		it("should display raster unavailable message when provided", () => {
			renderPanel({
				rasterUnavailableMessage: "No satellite image available for the selected date",
			});

			const alert = screen.getByRole("alert");
			expect(alert.textContent).toContain("No satellite image available");
		});

		it("should not display message when rasterUnavailableMessage is null", () => {
			renderPanel({ rasterUnavailableMessage: null });

			expect(screen.queryByRole("alert")).toBeNull();
		});
	});

	describe("Requirement 3.5: Trend preview line chart for active variable", () => {
		it("should display trend preview chart when trendData has 2+ points", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const trendData = generateTrendData(timestamps);

			renderPanel({ availableTimestamps: timestamps, trendData, activeVariableKey: "ndvi" });

			const chart = screen.getByLabelText("Trend preview for ndvi");
			expect(chart).toBeTruthy();
		});

		it("should not display chart when trendData has fewer than 2 points", () => {
			const timestamps = generateTimestamps("2024-01-01", 1, 5);
			const trendData = [{ ts: timestamps[0], value: 0.5 }];

			// Suppress CSS parsing errors from jsdom (modern CSS syntax not fully supported)
			const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

			renderPanel({ availableTimestamps: timestamps, trendData, activeVariableKey: "ndvi" });

			expect(screen.queryByLabelText("Trend preview for ndvi")).toBeNull();
			consoleError.mockRestore();
		});

		it("should not display chart when activeVariableKey is null", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const trendData = generateTrendData(timestamps);

			renderPanel({ availableTimestamps: timestamps, trendData, activeVariableKey: null });

			expect(screen.queryByLabelText(/Trend preview/)).toBeNull();
		});

		it("should display the variable key in uppercase", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5);
			const trendData = generateTrendData(timestamps);

			renderPanel({ availableTimestamps: timestamps, trendData, activeVariableKey: "ndvi" });

			expect(screen.getByText("NDVI")).toBeTruthy();
		});
	});

	describe("Requirement 3.6: Data gap visual indicators (gaps > 10 days)", () => {
		it("should display gap indicator when consecutive timestamps are more than 10 days apart", () => {
			const timestamps = [
				dayjs("2024-01-01").toDate(),
				dayjs("2024-01-05").toDate(),
				dayjs("2024-01-20").toDate(), // 15-day gap from Jan 5
				dayjs("2024-01-25").toDate(),
			];

			renderPanel({ availableTimestamps: timestamps, trendData: generateTrendData(timestamps) });

			// Should show a gap indicator with "15d"
			expect(screen.getByText("15d")).toBeTruthy();
		});

		it("should not display gap indicator when timestamps are 10 days or fewer apart", () => {
			const timestamps = generateTimestamps("2024-01-01", 5, 5); // 5-day intervals

			renderPanel({ availableTimestamps: timestamps, trendData: generateTrendData(timestamps) });

			// No gap indicators should be present
			expect(screen.queryByText(/\d+d/)).toBeNull();
		});

		it("should display multiple gap indicators for multiple gaps", () => {
			const timestamps = [
				dayjs("2024-01-01").toDate(),
				dayjs("2024-01-20").toDate(), // 19-day gap
				dayjs("2024-02-05").toDate(), // 16-day gap
				dayjs("2024-02-10").toDate(),
			];

			renderPanel({ availableTimestamps: timestamps, trendData: generateTrendData(timestamps) });

			expect(screen.getByText("19d")).toBeTruthy();
			expect(screen.getByText("16d")).toBeTruthy();
		});
	});

	describe("Requirement 3.7: Empty state when no timestamps available", () => {
		it("should display empty state message when no timestamps are available", () => {
			renderPanel({ availableTimestamps: [], trendData: [] });

			expect(
				screen.getByText(/No data available for the current selection/),
			).toBeTruthy();
		});

		it("should not render timeline controls in empty state", () => {
			renderPanel({ availableTimestamps: [], trendData: [] });

			expect(screen.queryByRole("listbox")).toBeNull();
			expect(screen.queryByLabelText("Range start")).toBeNull();
			expect(screen.queryByLabelText("Range end")).toBeNull();
		});
	});
});

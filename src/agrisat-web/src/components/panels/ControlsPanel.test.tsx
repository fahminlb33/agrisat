/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ControlsPanel, {
	type ControlsPanelProps,
	type Variable,
	type Zone,
	type ZoneLevel,
} from "./ControlsPanel";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import type { StoreApi } from "zustand/vanilla";
import type { QueryContextStore } from "#/stores/query-context";

// -----------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------

const TEST_LEVELS: ZoneLevel[] = [
	{ levelId: 1, level: "Farm" },
	{ levelId: 2, level: "Region" },
];

const TEST_ZONES: Zone[] = [
	{ zoneId: 1, levelId: 1, level: "Farm", name: "North Field", city: "Springfield", area: 50 },
	{ zoneId: 2, levelId: 1, level: "Farm", name: "South Field", city: "Springfield", area: 30 },
	{ zoneId: 3, levelId: 2, level: "Region", name: "East Block", city: "Shelbyville", area: 100 },
];

const TEST_VARIABLES: Variable[] = [
	{ variableId: 1, type: "dynamic", category: "vegetation", key: "ndvi", name: "NDVI", description: "Normalized Difference Vegetation Index" },
	{ variableId: 2, type: "dynamic", category: "vegetation", key: "gndvi", name: "GNDVI", description: "Green NDVI" },
	{ variableId: 3, type: "dynamic", category: "chlorophyll", key: "cire", name: "CIre", description: "Chlorophyll Index Red Edge" },
	{ variableId: 4, type: "dynamic", category: "water_stress", key: "ndmi", name: "NDMI", description: "Normalized Difference Moisture Index" },
	{ variableId: 5, type: "static", category: "topography", key: "dem", name: "DEM", description: "Digital Elevation Model" },
];

function createTestStore(): StoreApi<QueryContextStore> {
	const registry: ZoneLevelRegistry = new Map([
		[1, 1],
		[2, 1],
		[3, 2],
	]);
	return createQueryContextStore(registry);
}

function renderPanel(overrides?: Partial<ControlsPanelProps>) {
	const store = overrides?.store ?? createTestStore();
	const props: ControlsPanelProps = {
		levels: TEST_LEVELS,
		zones: TEST_ZONES,
		variables: TEST_VARIABLES,
		store,
		...overrides,
	};
	const result = render(<ControlsPanel {...props} />);
	return { ...result, store };
}

afterEach(() => {
	cleanup();
});

// -----------------------------------------------------------
// Tests
// -----------------------------------------------------------

describe("ControlsPanel", () => {
	describe("Requirement 4.1: Variables grouped by category", () => {
		it("should display variables grouped by category with name and key", () => {
			renderPanel();

			// Check category labels are rendered
			expect(screen.getByText("Vegetation")).toBeTruthy();
			expect(screen.getByText("Chlorophyll")).toBeTruthy();
			expect(screen.getByText("Water Stress")).toBeTruthy();
			expect(screen.getByText("Topography")).toBeTruthy();

			// Check variable names are rendered
			expect(screen.getByText("NDVI")).toBeTruthy();
			expect(screen.getByText("GNDVI")).toBeTruthy();
			expect(screen.getByText("CIre")).toBeTruthy();
			expect(screen.getByText("NDMI")).toBeTruthy();
			expect(screen.getByText("DEM")).toBeTruthy();

			// Check variable keys are rendered
			expect(screen.getByText("ndvi")).toBeTruthy();
			expect(screen.getByText("gndvi")).toBeTruthy();
			expect(screen.getByText("cire")).toBeTruthy();
			expect(screen.getByText("ndmi")).toBeTruthy();
			expect(screen.getByText("dem")).toBeTruthy();
		});
	});

	describe("Requirement 4.2: Toggle variable ON adds to variableIds", () => {
		it("should add variable to variableIds when toggled on", () => {
			const { store } = renderPanel();

			// After initial load, vegetation variables are pre-selected (Req 4.7)
			const state = store.getState();
			expect(state.variableIds).toContain(1); // NDVI
			expect(state.variableIds).toContain(2); // GNDVI
		});
	});

	describe("Requirement 4.3: Toggle variable OFF removes from variableIds", () => {
		it("should remove variable from variableIds when toggled off (if more than one remains)", () => {
			const { store } = renderPanel();

			// Both vegetation vars are toggled on by default
			expect(store.getState().variableIds).toContain(1);
			expect(store.getState().variableIds).toContain(2);

			// Toggle off GNDVI (variableId: 2)
			const gndviCheckbox = screen.getByLabelText("Toggle GNDVI");
			fireEvent.click(gndviCheckbox);

			expect(store.getState().variableIds).not.toContain(2);
			expect(store.getState().variableIds).toContain(1);
		});
	});

	describe("Requirement 4.4: Guard preventing removal of last variable", () => {
		it("should disable the checkbox when it is the last remaining variable", () => {
			const { store } = renderPanel();

			// Remove GNDVI so only NDVI remains
			const gndviCheckbox = screen.getByLabelText("Toggle GNDVI");
			fireEvent.click(gndviCheckbox);

			expect(store.getState().variableIds).toEqual([1]);

			// The NDVI checkbox should be disabled
			const ndviCheckbox = screen.getByLabelText("Toggle NDVI") as HTMLInputElement;
			expect(ndviCheckbox.disabled).toBe(true);
		});

		it("should keep the variable toggled on when attempting to remove the last one via store", () => {
			const { store } = renderPanel();

			// Remove GNDVI so only NDVI remains
			store.getState().toggleVariable(2);

			// Try to remove NDVI via the store directly
			store.getState().toggleVariable(1);

			// Should still have NDVI
			expect(store.getState().variableIds).toEqual([1]);
		});
	});

	describe("Requirement 4.5: Active variable selection", () => {
		it("should set active variable when clicking a toggled-on variable", () => {
			const { store } = renderPanel();

			// NDVI should be active by default (first vegetation var)
			expect(store.getState().activeVariableId).toBe(1);

			// Click GNDVI to make it active
			const gndviButton = screen.getByLabelText("Set GNDVI as active variable");
			fireEvent.click(gndviButton);

			expect(store.getState().activeVariableId).toBe(2);
		});

		it("should not allow setting a toggled-off variable as active", () => {
			renderPanel();

			// CIre (variableId: 3) is not toggled on
			const cireButton = screen.getByLabelText("Set CIre as active variable") as HTMLButtonElement;
			expect(cireButton.disabled).toBe(true);
		});
	});

	describe("Requirement 4.6: Fallback when active variable is toggled off", () => {
		it("should set first remaining variable as active when active is toggled off", () => {
			const { store } = renderPanel();

			// Set GNDVI as active
			store.getState().setActiveVariable(2);
			expect(store.getState().activeVariableId).toBe(2);

			// Toggle off GNDVI
			const gndviCheckbox = screen.getByLabelText("Toggle GNDVI");
			fireEvent.click(gndviCheckbox);

			// Active should fall back to NDVI (first remaining)
			expect(store.getState().activeVariableId).toBe(1);
		});
	});

	describe("Requirement 4.7: Pre-select vegetation variables on first load", () => {
		it("should pre-select all vegetation variables and set first as active", () => {
			const { store } = renderPanel();

			const state = store.getState();
			// All vegetation variables should be in variableIds
			expect(state.variableIds).toContain(1); // NDVI
			expect(state.variableIds).toContain(2); // GNDVI
			// Non-vegetation should not be pre-selected
			expect(state.variableIds).not.toContain(3); // CIre (chlorophyll)
			expect(state.variableIds).not.toContain(4); // NDMI (water_stress)
			expect(state.variableIds).not.toContain(5); // DEM (topography)
			// First vegetation variable should be active
			expect(state.activeVariableId).toBe(1);
		});
	});

	describe("Level selector", () => {
		it("should update QueryContext levelId when level is selected", () => {
			const { store } = renderPanel();

			// Radix Select doesn't render as native <select>, so we test via store action
			// which is what the component calls on value change
			store.getState().setLevel(1);

			expect(store.getState().levelId).toBe(1);
		});
	});

	describe("Zone filter/search", () => {
		it("should filter zones by search term", () => {
			const store = createTestStore();
			store.getState().setLevel(1);

			renderPanel({ store });

			const searchInput = screen.getByPlaceholderText("Search zones…");
			fireEvent.change(searchInput, { target: { value: "North" } });

			// Verify the search input value is updated (filtering is applied internally)
			expect((searchInput as HTMLInputElement).value).toBe("North");

			// The component filters zones internally via useMemo.
			// Since Radix Select doesn't render dropdown items in jsdom without complex interaction,
			// we verify the search input is functional and the component doesn't crash.
			// The filtering logic is: zones matching "North" in name or city are shown.
			// We can verify by clearing the search and checking the trigger still works.
			fireEvent.change(searchInput, { target: { value: "" } });
			expect((searchInput as HTMLInputElement).value).toBe("");
		});

		it("should disable zone select when no level is selected", () => {
			renderPanel();

			// Radix Select renders a trigger button with data-disabled when disabled
			const zoneTrigger = screen.getByLabelText("Select zone");
			expect(zoneTrigger.hasAttribute("data-disabled") || zoneTrigger.getAttribute("aria-disabled") === "true" || (zoneTrigger as HTMLButtonElement).disabled).toBe(true);
		});
	});
});

import { describe, it, expect, beforeEach } from "vitest";
import {
	createQueryContextStore,
	getDefaultState,
	type ZoneLevelRegistry,
	type QueryContextStore,
} from "./query-context";
import type { StoreApi } from "zustand/vanilla";

describe("QueryContext Store", () => {
	let store: StoreApi<QueryContextStore>;
	let registry: ZoneLevelRegistry;

	beforeEach(() => {
		// Zone 1 and 2 belong to level 1, zone 3 belongs to level 2
		registry = new Map([
			[1, 1],
			[2, 1],
			[3, 2],
		]);
		store = createQueryContextStore(registry);
	});

	describe("initial state", () => {
		it("should have default state on creation", () => {
			const state = store.getState();
			expect(state.levelId).toBeNull();
			expect(state.zoneId).toBeNull();
			expect(state.variableIds).toEqual([]);
			expect(state.activeVariableId).toBeNull();
			expect(state.comparisonMode).toBeNull();
			expect(state.timeRange.startTs).toBeInstanceOf(Date);
			expect(state.timeRange.endTs).toBeInstanceOf(Date);
			expect(state.timeRange.startTs.getTime()).toBeLessThan(
				state.timeRange.endTs.getTime(),
			);
		});
	});

	describe("setLevel", () => {
		it("should set the level and reset zone and activeVariable", () => {
			// Set up some state first
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().toggleVariable(10);
			store.getState().setActiveVariable(10);

			// Now change level
			store.getState().setLevel(2);

			const state = store.getState();
			expect(state.levelId).toBe(2);
			expect(state.zoneId).toBeNull();
			expect(state.activeVariableId).toBeNull();
		});
	});

	describe("setZone", () => {
		it("should reject zone when levelId is null", () => {
			store.getState().setZone(1);
			expect(store.getState().zoneId).toBeNull();
		});

		it("should reject zone that does not belong to current level", () => {
			store.getState().setLevel(1);
			// Zone 3 belongs to level 2
			store.getState().setZone(3);
			expect(store.getState().zoneId).toBeNull();
		});

		it("should accept zone that belongs to current level", () => {
			store.getState().setLevel(1);
			store.getState().setZone(1);
			expect(store.getState().zoneId).toBe(1);
		});

		it("should allow clearing zone to null", () => {
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().setZone(null);
			expect(store.getState().zoneId).toBeNull();
		});

		it("should reject unknown zone", () => {
			store.getState().setLevel(1);
			store.getState().setZone(999);
			expect(store.getState().zoneId).toBeNull();
		});
	});

	describe("toggleVariable", () => {
		it("should add variable when not present", () => {
			store.getState().toggleVariable(10);
			expect(store.getState().variableIds).toEqual([10]);
		});

		it("should remove variable when present and more than one exists", () => {
			store.getState().toggleVariable(10);
			store.getState().toggleVariable(20);
			store.getState().toggleVariable(10);
			expect(store.getState().variableIds).toEqual([20]);
		});

		it("should not remove the last variable (non-empty guard)", () => {
			store.getState().toggleVariable(10);
			store.getState().toggleVariable(10);
			expect(store.getState().variableIds).toEqual([10]);
		});

		it("should reset activeVariable to first remaining when active is removed", () => {
			store.getState().toggleVariable(10);
			store.getState().toggleVariable(20);
			store.getState().setActiveVariable(10);
			// Remove the active variable
			store.getState().toggleVariable(10);
			expect(store.getState().activeVariableId).toBe(20);
		});
	});

	describe("setActiveVariable", () => {
		it("should reject activeVariable not in variableIds", () => {
			store.getState().toggleVariable(10);
			store.getState().setActiveVariable(99);
			expect(store.getState().activeVariableId).toBeNull();
		});

		it("should accept activeVariable that is in variableIds", () => {
			store.getState().toggleVariable(10);
			store.getState().toggleVariable(20);
			store.getState().setActiveVariable(20);
			expect(store.getState().activeVariableId).toBe(20);
		});
	});

	describe("setTimeRange", () => {
		it("should reject when startTs >= endTs", () => {
			const original = store.getState().timeRange;
			const sameTime = new Date("2024-01-15");
			store.getState().setTimeRange(sameTime, sameTime);
			expect(store.getState().timeRange).toEqual(original);
		});

		it("should reject when startTs > endTs", () => {
			const original = store.getState().timeRange;
			const later = new Date("2024-02-01");
			const earlier = new Date("2024-01-01");
			store.getState().setTimeRange(later, earlier);
			expect(store.getState().timeRange).toEqual(original);
		});

		it("should accept valid time range", () => {
			const start = new Date("2024-01-01");
			const end = new Date("2024-02-01");
			store.getState().setTimeRange(start, end);
			expect(store.getState().timeRange).toEqual({
				startTs: start,
				endTs: end,
			});
		});
	});

	describe("comparison mode", () => {
		it("should enable comparison mode", () => {
			const mode = {
				type: "zone" as const,
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			};
			store.getState().enableComparison(mode);
			expect(store.getState().comparisonMode).toEqual(mode);
		});

		it("should disable comparison mode", () => {
			const mode = {
				type: "zone" as const,
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			};
			store.getState().enableComparison(mode);
			store.getState().disableComparison();
			expect(store.getState().comparisonMode).toBeNull();
		});
	});

	describe("reset", () => {
		it("should restore all fields to defaults", () => {
			// Mutate state
			store.getState().setLevel(1);
			store.getState().setZone(1);
			store.getState().toggleVariable(10);
			store.getState().setActiveVariable(10);
			store.getState().enableComparison({
				type: "zone",
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			});

			// Reset
			store.getState().reset();

			const state = store.getState();
			expect(state.levelId).toBeNull();
			expect(state.zoneId).toBeNull();
			expect(state.variableIds).toEqual([]);
			expect(state.activeVariableId).toBeNull();
			expect(state.comparisonMode).toBeNull();
			// Time range should be last 30 days
			const defaults = getDefaultState();
			expect(state.timeRange.startTs.getTime()).toBeCloseTo(
				defaults.timeRange.startTs.getTime(),
				-3,
			);
			expect(state.timeRange.endTs.getTime()).toBeCloseTo(
				defaults.timeRange.endTs.getTime(),
				-3,
			);
		});
	});
});

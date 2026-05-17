/**
 * @vitest-environment jsdom
 *
 * Integration tests for the Dashboard wiring:
 * - Verifies QueryContext store broadcasts changes to all subscribers (Req 1.2)
 * - Verifies comparison mode end-to-end flow (Req 8.1)
 * - Verifies all panels share the same store instance (Req 1.1)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
	type QueryContextStore,
} from "#/stores/query-context";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

// -----------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------

function createTestRegistry(): ZoneLevelRegistry {
	return new Map([
		[1, 1],
		[2, 1],
		[3, 2],
	]);
}

function createTestStore(): StoreApi<QueryContextStore> {
	return createQueryContextStore(createTestRegistry());
}

// -----------------------------------------------------------
// Minimal subscriber components to verify broadcast behavior
// -----------------------------------------------------------

function ZoneSubscriber({ store }: { store: StoreApi<QueryContextStore> }) {
	const zoneId = useStore(store, (s) => s.zoneId);
	return <div data-testid="zone-subscriber">zone:{zoneId ?? "null"}</div>;
}

function LevelSubscriber({ store }: { store: StoreApi<QueryContextStore> }) {
	const levelId = useStore(store, (s) => s.levelId);
	return <div data-testid="level-subscriber">level:{levelId ?? "null"}</div>;
}

function TimeRangeSubscriber({ store }: { store: StoreApi<QueryContextStore> }) {
	const timeRange = useStore(store, (s) => s.timeRange);
	return (
		<div data-testid="timerange-subscriber">
			range:{timeRange.startTs.toISOString().slice(0, 10)}-{timeRange.endTs.toISOString().slice(0, 10)}
		</div>
	);
}

function ActiveVarSubscriber({ store }: { store: StoreApi<QueryContextStore> }) {
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	return <div data-testid="activevar-subscriber">activeVar:{activeVariableId ?? "null"}</div>;
}

function ComparisonSubscriber({ store }: { store: StoreApi<QueryContextStore> }) {
	const comparisonMode = useStore(store, (s) => s.comparisonMode);
	if (!comparisonMode) {
		return <div data-testid="comparison-subscriber">comparison:off</div>;
	}
	return (
		<div data-testid="comparison-subscriber">
			comparison:{comparisonMode.type}|A:{JSON.stringify(comparisonMode.targetA)}|B:{JSON.stringify(comparisonMode.targetB)}
		</div>
	);
}

/** Simulates the four-panel layout with shared store */
function FourPanelLayout({ store }: { store: StoreApi<QueryContextStore> }) {
	return (
		<div>
			<ZoneSubscriber store={store} />
			<LevelSubscriber store={store} />
			<TimeRangeSubscriber store={store} />
			<ActiveVarSubscriber store={store} />
			<ComparisonSubscriber store={store} />
		</div>
	);
}

afterEach(() => {
	cleanup();
});

// -----------------------------------------------------------
// Tests
// -----------------------------------------------------------

describe("Dashboard Integration: QueryContext Broadcast (Req 1.1, 1.2)", () => {
	it("should broadcast level change to all subscribers within one render cycle", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		// Initial state
		expect(screen.getByTestId("level-subscriber").textContent).toBe("level:null");
		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:null");

		// Update level via store action
		act(() => {
			store.getState().setLevel(1);
		});

		// All subscribers should reflect the change immediately (same render cycle)
		expect(screen.getByTestId("level-subscriber").textContent).toBe("level:1");
		// Zone should be reset to null when level changes (Req 1.6)
		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:null");
	});

	it("should broadcast zone change to all subscribers", () => {
		const store = createTestStore();
		store.getState().setLevel(1);

		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().setZone(1);
		});

		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:1");
	});

	it("should broadcast time range change to all subscribers", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		const newStart = new Date("2024-01-01");
		const newEnd = new Date("2024-03-01");

		act(() => {
			store.getState().setTimeRange(newStart, newEnd);
		});

		expect(screen.getByTestId("timerange-subscriber").textContent).toBe(
			"range:2024-01-01-2024-03-01",
		);
	});

	it("should broadcast active variable change to all subscribers", () => {
		const store = createTestStore();
		// Need to add variables first
		store.getState().toggleVariable(1);
		store.getState().toggleVariable(2);
		store.getState().setActiveVariable(1);

		render(<FourPanelLayout store={store} />);

		expect(screen.getByTestId("activevar-subscriber").textContent).toBe("activeVar:1");

		act(() => {
			store.getState().setActiveVariable(2);
		});

		expect(screen.getByTestId("activevar-subscriber").textContent).toBe("activeVar:2");
	});
});

describe("Dashboard Integration: Comparison Mode Flow (Req 8.1)", () => {
	it("should enable comparison mode and broadcast to all subscribers", () => {
		const store = createTestStore();
		store.getState().setLevel(1);

		render(<FourPanelLayout store={store} />);

		expect(screen.getByTestId("comparison-subscriber").textContent).toBe("comparison:off");

		act(() => {
			store.getState().enableComparison({
				type: "zone",
				targetA: { zoneId: 1 },
				targetB: { zoneId: 2 },
			});
		});

		const content = screen.getByTestId("comparison-subscriber").textContent!;
		expect(content).toContain("comparison:zone");
		expect(content).toContain('"zoneId":1');
		expect(content).toContain('"zoneId":2');
	});

	it("should disable comparison mode and broadcast to all subscribers", () => {
		const store = createTestStore();
		store.getState().enableComparison({
			type: "zone",
			targetA: { zoneId: 1 },
			targetB: { zoneId: 2 },
		});

		render(<FourPanelLayout store={store} />);

		const content = screen.getByTestId("comparison-subscriber").textContent!;
		expect(content).toContain("comparison:zone");

		act(() => {
			store.getState().disableComparison();
		});

		expect(screen.getByTestId("comparison-subscriber").textContent).toBe("comparison:off");
	});

	it("should support time comparison mode with two time range targets", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().enableComparison({
				type: "time",
				targetA: { timeRange: { startTs: new Date("2024-01-01"), endTs: new Date("2024-02-01") } },
				targetB: { timeRange: { startTs: new Date("2024-03-01"), endTs: new Date("2024-04-01") } },
			});
		});

		const content = screen.getByTestId("comparison-subscriber").textContent!;
		expect(content).toContain("comparison:time");
	});

	it("should support variable comparison mode with two variable targets", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().enableComparison({
				type: "variable",
				targetA: { variableId: 1 },
				targetB: { variableId: 2 },
			});
		});

		const content = screen.getByTestId("comparison-subscriber").textContent!;
		expect(content).toContain("comparison:variable");
		expect(content).toContain('"variableId":1');
		expect(content).toContain('"variableId":2');
	});
});

describe("Dashboard Integration: Store Validation Guards", () => {
	it("should reject zone selection when level is null (Req 1.8)", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().setZone(1);
		});

		// Zone should remain null because level is null
		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:null");
	});

	it("should reject zone that does not belong to current level (Req 1.3)", () => {
		const store = createTestStore();
		store.getState().setLevel(1); // Level 1

		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().setZone(3); // Zone 3 belongs to level 2
		});

		// Zone should remain null
		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:null");
	});

	it("should reject invalid time range where start >= end (Req 1.5)", () => {
		const store = createTestStore();
		render(<FourPanelLayout store={store} />);

		const initialContent = screen.getByTestId("timerange-subscriber").textContent;

		act(() => {
			store.getState().setTimeRange(new Date("2024-03-01"), new Date("2024-01-01"));
		});

		// Time range should not change
		expect(screen.getByTestId("timerange-subscriber").textContent).toBe(initialContent);
	});

	it("should reject active variable not in variableIds (Req 1.4)", () => {
		const store = createTestStore();
		store.getState().toggleVariable(1);
		store.getState().setActiveVariable(1);

		render(<FourPanelLayout store={store} />);

		act(() => {
			store.getState().setActiveVariable(99); // Not in variableIds
		});

		// Active variable should remain 1
		expect(screen.getByTestId("activevar-subscriber").textContent).toBe("activeVar:1");
	});

	it("should reset zone and activeVariable when level changes (Req 1.6)", () => {
		const store = createTestStore();
		store.getState().setLevel(1);
		store.getState().setZone(1);
		store.getState().toggleVariable(1);
		store.getState().setActiveVariable(1);

		render(<FourPanelLayout store={store} />);

		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:1");
		expect(screen.getByTestId("activevar-subscriber").textContent).toBe("activeVar:1");

		act(() => {
			store.getState().setLevel(2);
		});

		expect(screen.getByTestId("zone-subscriber").textContent).toBe("zone:null");
		expect(screen.getByTestId("activevar-subscriber").textContent).toBe("activeVar:null");
	});
});

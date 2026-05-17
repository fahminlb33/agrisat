import dayjs from "dayjs";
import { createStore } from "zustand/vanilla";

// -----------------------------------------------------------
// Interfaces
// -----------------------------------------------------------

export interface ComparisonTarget {
	zoneId?: number;
	timeRange?: { startTs: Date; endTs: Date };
	variableId?: number;
}

export interface ComparisonMode {
	type: "zone" | "time" | "variable";
	targetA: ComparisonTarget;
	targetB: ComparisonTarget;
}

export interface QueryContext {
	levelId: number | null;
	zoneId: number | null;
	variableIds: number[];
	activeVariableId: number | null;
	timeRange: { startTs: Date; endTs: Date };
	comparisonMode: ComparisonMode | null;
}

export interface QueryContextActions {
	setLevel(levelId: number): void;
	setZone(zoneId: number | null): void;
	toggleVariable(variableId: number): void;
	setActiveVariable(variableId: number): void;
	setTimeRange(startTs: Date, endTs: Date): void;
	enableComparison(mode: ComparisonMode): void;
	disableComparison(): void;
	reset(): void;
}

export type QueryContextStore = QueryContext & QueryContextActions;

// -----------------------------------------------------------
// Zone registry for validation
// -----------------------------------------------------------

/**
 * A registry mapping zone IDs to their level IDs.
 * Must be populated before zone validation can work.
 */
export type ZoneLevelRegistry = Map<number, number>;

// -----------------------------------------------------------
// Defaults
// -----------------------------------------------------------

export function getDefaultTimeRange(): { startTs: Date; endTs: Date } {
	return {
		startTs: dayjs().subtract(30, "day").startOf("day").toDate(),
		endTs: dayjs().startOf("day").toDate(),
	};
}

export function getDefaultState(): QueryContext {
	return {
		levelId: null,
		zoneId: null,
		variableIds: [],
		activeVariableId: null,
		timeRange: getDefaultTimeRange(),
		comparisonMode: null,
	};
}

// -----------------------------------------------------------
// Store factory
// -----------------------------------------------------------

export function createQueryContextStore(zoneLevelRegistry: ZoneLevelRegistry) {
	return createStore<QueryContextStore>()((set, get) => ({
		...getDefaultState(),

		setLevel(levelId: number) {
			set({
				levelId,
				zoneId: null,
				activeVariableId: null,
			});
		},

		setZone(zoneId: number | null) {
			const state = get();

			// Reject if level_id is null
			if (state.levelId === null) {
				return;
			}

			// Allow clearing zone
			if (zoneId === null) {
				set({ zoneId: null });
				return;
			}

			// Validate zone belongs to the current level
			const zoneLevelId = zoneLevelRegistry.get(zoneId);
			if (zoneLevelId === undefined || zoneLevelId !== state.levelId) {
				return;
			}

			set({ zoneId });
		},

		toggleVariable(variableId: number) {
			const state = get();
			const index = state.variableIds.indexOf(variableId);

			if (index === -1) {
				// Add variable
				set({ variableIds: [...state.variableIds, variableId] });
			} else {
				// Guard: do not remove the last variable
				if (state.variableIds.length <= 1) {
					return;
				}

				const newVariableIds = state.variableIds.filter(
					(id) => id !== variableId,
				);

				// If the removed variable was the active one, reset active to first remaining
				const newActiveVariableId =
					state.activeVariableId === variableId
						? newVariableIds[0] ?? null
						: state.activeVariableId;

				set({
					variableIds: newVariableIds,
					activeVariableId: newActiveVariableId,
				});
			}
		},

		setActiveVariable(variableId: number) {
			const state = get();

			// Reject if variableId is not in variableIds
			if (!state.variableIds.includes(variableId)) {
				return;
			}

			set({ activeVariableId: variableId });
		},

		setTimeRange(startTs: Date, endTs: Date) {
			// Reject if startTs is not strictly before endTs
			if (startTs.getTime() >= endTs.getTime()) {
				return;
			}

			set({ timeRange: { startTs, endTs } });
		},

		enableComparison(mode: ComparisonMode) {
			set({ comparisonMode: mode });
		},

		disableComparison() {
			set({ comparisonMode: null });
		},

		reset() {
			set(getDefaultState());
		},
	}));
}

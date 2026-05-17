import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import ControlsPanel from "#/components/panels/ControlsPanel";
import MapPanel from "#/components/panels/MapPanel";
import TimelinePanel from "#/components/panels/TimelinePanel";
import AnalysisPanel from "#/components/panels/AnalysisPanel";
import { ErrorBoundary } from "#/components/ErrorBoundary";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import { useLevels, useZones, useVariables } from "#/hooks/useLayers";
import { useEnvironmentalData } from "#/hooks/useEnvironmentalData";
import { useWeatherData } from "#/hooks/useWeatherData";
import { useInsights } from "#/hooks/useInsights";
import { useComparison } from "#/hooks/useComparison";
import type { Zone as ApiZone, Variable as ApiVariable, Level } from "#/services/api";
import type { ZoneLevel, Zone, Variable } from "#/components/panels/ControlsPanel";
import type { EnvironmentalTimePoint } from "#/types/api";

export const Route = createFileRoute("/")({ component: Dashboard });

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function mapLevels(apiLevels: Level[]): ZoneLevel[] {
	return apiLevels.map((l) => ({ levelId: l.level_id, level: l.level }));
}

function mapZones(apiZones: ApiZone[]): Zone[] {
	return apiZones.map((z) => ({
		zoneId: z.zone_id,
		levelId: z.level_id,
		level: z.level,
		name: z.name,
		city: z.city,
		area: z.area,
	}));
}

function mapVariables(apiVars: ApiVariable[]): Variable[] {
	return apiVars.map((v) => ({
		variableId: v.variable_id,
		type: v.type as "static" | "dynamic",
		category: v.category as Variable["category"],
		key: v.key,
		name: v.name,
		description: v.description,
	}));
}

const VARIABLE_KEY_MAP: Record<number, string> = {
	1: "ndvi",
	2: "gndvi",
	3: "wdrvi",
	4: "msavi",
	5: "ndre",
	6: "cire",
	7: "ndmi",
	8: "ndwi",
};

// -----------------------------------------------------------
// Store-connected hook: subscribes to QueryContext for reactive data fetching
// -----------------------------------------------------------

function useStoreState(store: ReturnType<typeof createQueryContextStore>) {
	const zoneId = useStore(store, (s) => s.zoneId);
	const levelId = useStore(store, (s) => s.levelId);
	const timeRange = useStore(store, (s) => s.timeRange);
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	const variableIds = useStore(store, (s) => s.variableIds);
	const comparisonMode = useStore(store, (s) => s.comparisonMode);

	return { zoneId, levelId, timeRange, activeVariableId, variableIds, comparisonMode };
}

// -----------------------------------------------------------
// Dashboard Component
// -----------------------------------------------------------

function Dashboard() {
	// -----------------------------------------------------------
	// Load reference data via TanStack Query hooks
	// -----------------------------------------------------------
	const { data: rawLevels, isLoading: levelsLoading } = useLevels();
	const { data: rawZones, isLoading: zonesLoading } = useZones();
	const { data: rawVariables, isLoading: variablesLoading } = useVariables();

	const levels = useMemo(() => mapLevels(rawLevels ?? []), [rawLevels]);
	const zones = useMemo(() => mapZones(rawZones ?? []), [rawZones]);
	const variables = useMemo(() => mapVariables(rawVariables ?? []), [rawVariables]);

	// -----------------------------------------------------------
	// Store initialization
	// -----------------------------------------------------------
	const storeRef = useRef<ReturnType<typeof createQueryContextStore> | null>(null);
	const [storeReady, setStoreReady] = useState(false);

	useEffect(() => {
		if (!rawZones || rawZones.length === 0) return;
		if (storeRef.current) return; // Already initialized

		// Build zone-level registry for store validation
		const registry: ZoneLevelRegistry = new Map();
		for (const z of rawZones) {
			registry.set(z.zone_id, z.level_id);
		}

		storeRef.current = createQueryContextStore(registry);
		setStoreReady(true);
	}, [rawZones]);

	const store = storeRef.current;

	// -----------------------------------------------------------
	// Loading state
	// -----------------------------------------------------------
	const loading = levelsLoading || zonesLoading || variablesLoading;

	if (loading || !storeReady || !store) {
		return (
			<main className="flex h-[calc(100vh-64px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--lagoon)] border-t-transparent mx-auto" />
					<p className="text-sm text-[var(--sea-ink-soft)]">Loading AgriSat…</p>
				</div>
			</main>
		);
	}

	return <DashboardContent store={store} levels={levels} zones={zones} variables={variables} />;
}

// -----------------------------------------------------------
// Inner component that has access to the store (avoids conditional hooks)
// -----------------------------------------------------------

function DashboardContent({
	store,
	levels,
	zones,
	variables,
}: {
	store: ReturnType<typeof createQueryContextStore>;
	levels: ZoneLevel[];
	zones: Zone[];
	variables: Variable[];
}) {
	const { zoneId, levelId, timeRange, activeVariableId, variableIds, comparisonMode } =
		useStoreState(store);

	// -----------------------------------------------------------
	// Data fetching via TanStack Query hooks
	// All hooks react to QueryContext changes synchronously via useStore
	// ensuring all panels update within one render cycle (Req 1.2)
	// -----------------------------------------------------------

	const { data: envData = [] } = useEnvironmentalData({
		zoneId,
		levelId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const { data: weatherData = [] } = useWeatherData({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	// Derive variable keys from variableIds for insights/comparison
	const activeVariableKeys = useMemo(() => {
		return variableIds
			.map((id) => VARIABLE_KEY_MAP[id])
			.filter((key): key is string => key != null);
	}, [variableIds]);

	// Insights: fetch zone analysis when a zone is selected
	const { data: zoneAnalysis } = useInsights({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
		variableKeys: activeVariableKeys,
	});

	// -----------------------------------------------------------
	// Comparison mode: end-to-end wiring (Req 8.1)
	// When comparison is enabled with two zone targets, fetch comparison data
	// -----------------------------------------------------------

	const comparisonZoneA = comparisonMode?.type === "zone"
		? comparisonMode.targetA.zoneId ?? null
		: null;
	const comparisonZoneB = comparisonMode?.type === "zone"
		? comparisonMode.targetB.zoneId ?? null
		: null;

	const { data: comparisonResult } = useComparison({
		zoneA: comparisonZoneA,
		zoneB: comparisonZoneB,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
		variableKeys: activeVariableKeys,
		enabled: comparisonMode?.type === "zone" && comparisonZoneA != null && comparisonZoneB != null,
	});

	// Determine comparison target names for display
	const comparisonTargetAName = useMemo(() => {
		if (comparisonZoneA == null) return "Target A";
		const zone = zones.find((z) => z.zoneId === comparisonZoneA);
		return zone?.name ?? `Zone ${comparisonZoneA}`;
	}, [comparisonZoneA, zones]);

	const comparisonTargetBName = useMemo(() => {
		if (comparisonZoneB == null) return "Target B";
		const zone = zones.find((z) => z.zoneId === comparisonZoneB);
		return zone?.name ?? `Zone ${comparisonZoneB}`;
	}, [comparisonZoneB, zones]);

	// Determine if comparison data is missing
	const comparisonMissingData = useMemo(() => {
		if (!comparisonResult) return null;
		const hasA = comparisonResult.metrics_a.length > 0;
		const hasB = comparisonResult.metrics_b.length > 0;
		if (!hasA && !hasB) return "both" as const;
		if (!hasA) return "target_a" as const;
		if (!hasB) return "target_b" as const;
		return null;
	}, [comparisonResult]);

	// -----------------------------------------------------------
	// Derived data for panels
	// -----------------------------------------------------------

	const zoneInfo = useMemo(() => {
		if (!zoneId) return null;
		const zone = zones.find((z) => z.zoneId === zoneId);
		if (!zone) return null;
		return {
			zoneId: zone.zoneId,
			zoneName: zone.name,
			level: zone.level,
			city: zone.city,
		};
	}, [zoneId, zones]);

	const availableTimestamps = useMemo(() => {
		return envData.map((d: EnvironmentalTimePoint) => new Date(d.timestamp));
	}, [envData]);

	const trendData = useMemo(() => {
		if (!activeVariableId) return [];
		const key = VARIABLE_KEY_MAP[activeVariableId] ?? "ndvi";
		return envData.map((d: EnvironmentalTimePoint) => ({
			ts: new Date(d.timestamp),
			value: (d as unknown as Record<string, unknown>)[key] as number ?? 0,
		}));
	}, [envData, activeVariableId]);

	const activeVariableKey = activeVariableId
		? VARIABLE_KEY_MAP[activeVariableId] ?? null
		: null;

	// Data source attribution: derive from the most recent environmental data point
	const dataSource = useMemo(() => {
		if (envData.length === 0) return null;
		const lastPoint = envData[envData.length - 1];
		return {
			satelliteName: "Sentinel-2",
			lastObservationDate: lastPoint.timestamp,
		};
	}, [envData]);

	// -----------------------------------------------------------
	// Render: Four-panel layout
	// -----------------------------------------------------------

	return (
		<main className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
			{/* Top section: Controls + Map + Analysis */}
			<div className="flex flex-1 overflow-hidden">
				{/* Left: Controls Panel */}
				<div className="w-72 shrink-0 overflow-hidden">
					<ErrorBoundary>
						<ControlsPanel
							levels={levels}
							zones={zones}
							variables={variables}
							store={store}
						/>
					</ErrorBoundary>
				</div>

				{/* Center: Map Panel */}
				<div className="flex-1 overflow-hidden">
					<ErrorBoundary>
						<MapPanel
							store={store}
							environmentalData={envData as unknown as import("#/components/panels/MapPanel").MapPanelProps["environmentalData"]}
						/>
					</ErrorBoundary>
				</div>

				{/* Right: Analysis Panel */}
				<div className="w-80 shrink-0 overflow-hidden">
					<ErrorBoundary>
						<AnalysisPanel
							store={store}
							environmentalData={envData as unknown as import("#/components/panels/AnalysisPanel").EnvironmentalTimePoint[]}
							weatherData={weatherData as unknown as import("#/components/panels/AnalysisPanel").WeatherTimePoint[]}
							zoneInfo={zoneInfo}
							insights={zoneAnalysis?.insights}
							comparisonResult={comparisonResult ?? undefined}
							comparisonTargetAName={comparisonTargetAName}
							comparisonTargetBName={comparisonTargetBName}
							comparisonMissingData={comparisonMissingData}
							dataSource={dataSource}
						/>
					</ErrorBoundary>
				</div>
			</div>

			{/* Bottom: Timeline Panel */}
			<div className="shrink-0">
				<ErrorBoundary>
					<TimelinePanel
						store={store}
						availableTimestamps={availableTimestamps}
						trendData={trendData}
						activeVariableKey={activeVariableKey}
					/>
				</ErrorBoundary>
			</div>
		</main>
	);
}

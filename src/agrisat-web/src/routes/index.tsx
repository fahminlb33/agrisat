import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Leaf } from "lucide-react";

import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import { useLevels, useZones, useVariables } from "#/hooks/useLayers";
import ThemeToggle from "#/components/ThemeToggle";
import { AIAssistantPanel } from "#/components/ai/AIAssistantPanel";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

import {
	ControlProvider,
	useControls,
	MapOverlay,
	ZoneSearch,
	ZoneHUD,
	WeatherWidget,
	BottomBar,
} from "#/components/sections/fullscreen";

export const Route = createFileRoute("/")({
	component: MinimalMapView,
});

function MinimalMapView() {
	const { data: rawLevels, isLoading: levelsLoading, isError: levelsError } = useLevels();
	const { data: rawZones, isLoading: zonesLoading, isError: zonesError } = useZones();
	const { data: rawVariables } = useVariables();

	// Store setup — created once when data is ready
	const storeRef = useRef<ReturnType<typeof createQueryContextStore> | null>(null);
	const [storeReady, setStoreReady] = useState(false);

	const fetchDone = !levelsLoading && !zonesLoading;

	useEffect(() => {
		if (!fetchDone) return;
		if (storeRef.current) return;

		const registry: ZoneLevelRegistry = new Map();
		if (rawZones) {
			for (const z of rawZones) {
				registry.set(z.zone_id, z.level_id);
			}
		}

		const store = createQueryContextStore(registry);
		storeRef.current = store;

		if (rawLevels && rawLevels.length > 0 && rawZones && rawZones.length > 0) {
			const extentLevel = rawLevels.find((l) => l.level === "extent");
			const defaultLevel = extentLevel ?? rawLevels[0];
			store.getState().setLevel(defaultLevel.level_id);

			const firstZone = rawZones.find((z) => z.level_id === defaultLevel.level_id);
			if (firstZone) {
				store.getState().setZone(firstZone.zone_id);
			}
		}

		// Default to NDVI variable
		if (rawVariables && rawVariables.length > 0) {
			const ndvi = rawVariables.find((v) => v.key === "ndvi");
			if (ndvi) {
				store.getState().toggleVariable(ndvi.variable_id);
				store.getState().setActiveVariable(ndvi.variable_id);
			}
		}

		setStoreReady(true);
	}, [fetchDone, rawZones, rawLevels, rawVariables]);

	if (!fetchDone || !storeReady || !storeRef.current) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-[var(--background)]">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
			</div>
		);
	}

	return (
		<ControlProvider queryStore={storeRef.current}>
			<FullscreenLayout
				levels={rawLevels ?? []}
				zones={rawZones ?? []}
				variables={rawVariables ?? []}
				hasDataError={levelsError || zonesError}
			/>
		</ControlProvider>
	);
}

function FullscreenLayout({
	levels,
	zones,
	variables,
	hasDataError,
}: {
	levels: import("#/services/api").Level[];
	zones: import("#/services/api").Zone[];
	variables: import("#/services/api").Variable[];
	hasDataError?: boolean;
}) {
	// Only AI panel state at this level — nothing else
	const aiPanelOpen = useControls((s) => s.aiPanelOpen);
	const openAiPanel = useControls((s) => s.openAiPanel);
	const closeAiPanel = useControls((s) => s.closeAiPanel);

	// Lift expanded state so the wrapper width stays in sync with the panel
	const [aiExpanded, setAiExpanded] = useState(false);

	return (
		<div className="fixed inset-0 z-50 h-screen w-full overflow-hidden bg-background text-foreground">
			{/* Full-screen map — self-contained */}
			<MapOverlay zones={zones} />

			{/* Zone selector — self-contained */}
			<ZoneSearch levels={levels} zones={zones} />

			{/* Logo + theme toggle — top left */}
			<div className="absolute top-4 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<div className="flex items-center gap-2">
					<a
						href="/dashboard"
						className="flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl"
					>
						<Leaf className="h-5 w-5 text-emerald-500" />
						<span className="hidden sm:inline text-sm font-semibold text-foreground">AgriSat</span>
					</a>
					<ThemeToggle variant="floating" />
				</div>
			</div>

			{/* Weather widget — top right, self-contained */}
			<div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-right-4 duration-300">
				<WeatherWidget />
			</div>

			{/* Zone HUD — middle left, self-contained */}
			<ZoneHUD zones={zones} levels={levels} variables={variables} />

			{/* Bottom bar — self-contained */}
			<BottomBar levels={levels} zones={zones} variables={variables} />

			{/* AI Assistant button — bottom left, sits above the bottom bar */}
			<div className="absolute bottom-[4.5rem] md:bottom-5 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<Button
					variant="ghost"
					onClick={openAiPanel}
					aria-label="Open AI Assistant"
					className="rounded-xl bg-background/95 px-3 py-2.5 h-auto shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl hover:bg-background/95 gap-2"
				>
					<Bot className="h-4 w-4 text-emerald-500" />
					<span className="text-xs font-medium text-foreground">AI</span>
				</Button>
			</div>

			{/* AI Assistant Panel overlay */}
			{aiPanelOpen && (
				<div
					className={cn(
						"absolute z-30 overflow-hidden rounded-xl bg-background/95 shadow-lg backdrop-blur-md ring-1 ring-border/50 animate-in slide-in-from-bottom-8 duration-300 transition-[width,height]",
						"[&>aside]:h-full [&>aside]:w-full [&>aside]:border-l-0",
						// Mobile: full screen overlay
						"inset-0 rounded-none sm:inset-auto",
						// Desktop: floating panel above bottom bar
						aiExpanded
							? "sm:bottom-[5.5rem] sm:left-4 sm:h-[70vh] sm:w-[820px] sm:rounded-xl"
							: "sm:bottom-[5.5rem] sm:left-4 sm:h-[70vh] sm:w-[380px] sm:rounded-xl",
					)}
				>
					<AIAssistantPanel
						open={aiPanelOpen}
						onClose={closeAiPanel}
						expanded={aiExpanded}
						onExpandedChange={setAiExpanded}
					/>
				</div>
			)}

			{/* Data error notice */}
			{hasDataError && (
				<div className="absolute top-4 left-4 z-20 animate-in fade-in duration-300">
					<div className="rounded-lg bg-amber-50/95 px-3 py-2 text-xs text-amber-700 shadow-md backdrop-blur-md dark:bg-amber-950/90 dark:text-amber-300">
						Unable to load zone data
					</div>
				</div>
			)}
		</div>
	);
}

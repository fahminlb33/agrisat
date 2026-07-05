import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import { useLevels, useZones, useVariables } from "#/hooks/useLayers";
import { ImmersiveLayout } from "#/components/layout/ImmersiveLayout";

import {
	ControlProvider,
} from "#/components/sections/fullscreen";

export const Route = createFileRoute("/")({
	component: MinimalMapView,
});

function MinimalMapView() {
	const {
		data: rawLevels,
		isLoading: levelsLoading,
		isError: levelsError,
	} = useLevels();
	const {
		data: rawZones,
		isLoading: zonesLoading,
		isError: zonesError,
	} = useZones();
	const { data: rawVariables } = useVariables();

	// Store setup — created once when data is ready
	const storeRef = useRef<ReturnType<typeof createQueryContextStore> | null>(
		null,
	);
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

			const firstZone = rawZones.find(
				(z) => z.level_id === defaultLevel.level_id,
			);
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
			<ImmersiveLayout
				levels={rawLevels ?? []}
				zones={rawZones ?? []}
				variables={rawVariables ?? []}
				hasDataError={levelsError || zonesError}
			/>
		</ControlProvider>
	);
}

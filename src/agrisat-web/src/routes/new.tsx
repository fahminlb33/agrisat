import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
	Search,
	Cloud,
	CloudRain,
	Droplets,
	MapPin,
	Layers,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Play,
	Pause,
	Bot,
	Leaf,
} from "lucide-react";
import MapLibreGL from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import dayjs from "dayjs";
import {
	Area,
	AreaChart,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { Map as MapComponent, MapControls } from "#/components/ui/map";
import { httpClient } from "#/services/api";
import {
	createQueryContextStore,
	type ZoneLevelRegistry,
} from "#/stores/query-context";
import { useLevels, useZones, useVariables } from "#/hooks/useLayers";
import { useWeatherData } from "#/hooks/useWeatherData";
import { useEnvironmentalData } from "#/hooks/useEnvironmentalData";
import ThemeToggle from "#/components/ThemeToggle";
import { AIAssistantPanel } from "#/components/ai/AIAssistantPanel";
import type { Zone as ApiZone, Level as ApiLevel } from "#/services/api";
import type { WeatherTimePoint } from "#/types/api";

export const Route = createFileRoute("/new")({
	component: MinimalMapView,
});

// -----------------------------------------------------------
// Constants
// -----------------------------------------------------------

const INITIAL_CENTER: [number, number] = [106.8, -6.6];
const INITIAL_ZOOM = 11;

const VARIABLE_KEY_MAP: Record<number, string> = {
	2: "ndvi",
	3: "gndvi",
	4: "wdrvi",
	5: "msavi",
	6: "ndre",
	7: "cire",
	8: "ndmi",
	9: "ndwi",
};

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function computeBounds(geojson: FeatureCollection): MapLibreGL.LngLatBoundsLike | null {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;

	function processCoords(coords: number[]) {
		if (coords.length < 2) return;
		const [lng, lat] = coords;
		if (typeof lng !== "number" || typeof lat !== "number") return;
		if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return;
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}

	function processGeometry(geometry: Geometry) {
		if (!geometry) return;
		if (geometry.type === "Point") {
			processCoords(geometry.coordinates);
		} else if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
			for (const coord of geometry.coordinates) processCoords(coord);
		} else if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
			for (const ring of geometry.coordinates) {
				for (const coord of ring) processCoords(coord);
			}
		} else if (geometry.type === "MultiPolygon") {
			for (const polygon of geometry.coordinates) {
				for (const ring of polygon) {
					for (const coord of ring) processCoords(coord);
				}
			}
		} else if (geometry.type === "GeometryCollection") {
			for (const geom of geometry.geometries) processGeometry(geom);
		}
	}

	for (const feature of geojson.features) {
		if (feature.geometry) processGeometry(feature.geometry);
	}

	if (minLng === Infinity || maxLng === -Infinity) return null;
	if (minLng === maxLng && minLat === maxLat) return null;

	return [[minLng, minLat], [maxLng, maxLat]];
}

// -----------------------------------------------------------
// Main Component
// -----------------------------------------------------------

function MinimalMapView() {
	const { data: rawLevels, isLoading: levelsLoading, isError: levelsError } = useLevels();
	const { data: rawZones, isLoading: zonesLoading, isError: zonesError } = useZones();
	const { data: rawVariables } = useVariables();

	// Store setup
	const storeRef = useRef<ReturnType<typeof createQueryContextStore> | null>(null);
	const [storeReady, setStoreReady] = useState(false);

	const fetchDone = (!levelsLoading && !zonesLoading);

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
		<MinimalMapContent
			store={storeRef.current}
			levels={rawLevels ?? []}
			zones={rawZones ?? []}
			hasDataError={levelsError || zonesError}
		/>
	);
}

// -----------------------------------------------------------
// Content (with store access)
// -----------------------------------------------------------

function MinimalMapContent({
	store,
	levels,
	zones,
	hasDataError,
}: {
	store: ReturnType<typeof createQueryContextStore>;
	levels: ApiLevel[];
	zones: ApiZone[];
	hasDataError?: boolean;
}) {
	const zoneId = useStore(store, (s) => s.zoneId);
	const levelId = useStore(store, (s) => s.levelId);
	const timeRange = useStore(store, (s) => s.timeRange);
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	const setZone = useStore(store, (s) => s.setZone);
	const setLevel = useStore(store, (s) => s.setLevel);

	const mapRef = useRef<MapLibreGL.Map | null>(null);
	const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
	const [mapReady, setMapReady] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [aiPanelOpen, setAiPanelOpen] = useState(false);
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const layersAddedRef = useRef(false);
	const rasterLayerAddedRef = useRef(false);

	// Raster layer state
	const [rasterImageUrl, setRasterImageUrl] = useState<string | null>(null);
	const [rasterBounds, setRasterBounds] = useState<[number, number, number, number] | null>(null);
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);

	// Weather data
	const { data: weatherData = [] } = useWeatherData({
		zoneId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	// Environmental data for timeline
	const { data: envData = [] } = useEnvironmentalData({
		zoneId,
		levelId,
		startTs: timeRange.startTs,
		endTs: timeRange.endTs,
	});

	const latestWeather = weatherData.length > 0 ? weatherData[weatherData.length - 1] : null;

	// Available timestamps from env data (unique dates, sorted)
	const availableTimestamps = useMemo(() => {
		const dateSet = new Set<string>();
		for (const d of envData) {
			dateSet.add(dayjs(d.timestamp).format("YYYY-MM-DD"));
		}
		return Array.from(dateSet)
			.sort()
			.map((s) => dayjs(s).toDate());
	}, [envData]);

	// Default to latest date when timestamps change
	useEffect(() => {
		if (availableTimestamps.length > 0 && selectedDate === null) {
			setSelectedDate(availableTimestamps[availableTimestamps.length - 1]);
		}
	}, [availableTimestamps, selectedDate]);

	// Current zone info
	const currentZone = useMemo(() => {
		if (!zoneId) return null;
		return zones.find((z) => z.zone_id === zoneId) ?? null;
	}, [zoneId, zones]);

	// Zones filtered by current level
	const zonesForLevel = useMemo(() => {
		if (levelId === null) return [];
		return zones.filter((z) => z.level_id === levelId);
	}, [zones, levelId]);

	// Filtered zones for search
	const filteredZones = useMemo(() => {
		const source = zonesForLevel.length > 0 ? zonesForLevel : zones;
		if (!searchQuery.trim()) return source.slice(0, 10);
		const q = searchQuery.toLowerCase();
		return source.filter(
			(z) =>
				z.name.toLowerCase().includes(q) ||
				z.city.toLowerCase().includes(q),
		).slice(0, 10);
	}, [zones, zonesForLevel, searchQuery]);

	// -----------------------------------------------------------
	// Fetch raster overlay when date or variable changes
	// -----------------------------------------------------------
	useEffect(() => {
		if (activeVariableId === null || !selectedDate) {
			setRasterImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
			setRasterBounds(null);
			return;
		}

		let cancelled = false;

		async function fetchRaster() {
			try {
				const ts = dayjs(selectedDate).format("YYYY-MM-DD");
				const response = await httpClient.get("layers/rasters", {
					searchParams: { variable_id: activeVariableId!, ts },
					throwHttpErrors: false,
				});

				if (cancelled) return;

				if (response.ok) {
					const blob = await response.blob();
					if (cancelled) return;
					const imageUrl = URL.createObjectURL(blob);
					setRasterImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return imageUrl; });
				} else {
					setRasterImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
				}
			} catch {
				if (!cancelled) {
					setRasterImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
				}
			}
		}

		fetchRaster();
		return () => { cancelled = true; };
	}, [activeVariableId, selectedDate]);

	// Compute raster bounds from geojson
	useEffect(() => {
		if (!geojson) { setRasterBounds(null); return; }
		const bounds = computeBounds(geojson);
		if (!bounds) { setRasterBounds(null); return; }
		const [[west, south], [east, north]] = bounds as [[number, number], [number, number]];
		setRasterBounds([west, south, east, north]);
	}, [geojson]);

	// Clean up on unmount
	useEffect(() => {
		return () => { setRasterImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; }); };
	}, []);

	// Fetch polygons
	useEffect(() => {
		if (levelId === null) return;
		let cancelled = false;

		async function fetchPolygons() {
			try {
				const res = await httpClient
					.get("layers/polygons", { searchParams: { level_id: levelId! } })
					.json<FeatureCollection>();
				if (!cancelled) setGeojson(res);
			} catch {
				// silently ignore
			}
		}

		fetchPolygons();
		return () => { cancelled = true; };
	}, [levelId]);

	// Fit bounds when polygons load
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !geojson || !mapReady) return;
		if (!geojson.features || geojson.features.length === 0) return;

		const bounds = computeBounds(geojson);
		if (!bounds) return;

		const timer = setTimeout(() => {
			try {
				map.fitBounds(bounds, { padding: 60, duration: 800 });
			} catch { /* ignore */ }
		}, 200);

		return () => clearTimeout(timer);
	}, [geojson, mapReady]);

	// Track whether events are already registered
	const eventsRegisteredRef = useRef(false);

	// Add zone layers + raster to map
	const updateMapLayers = useCallback(() => {
		const map = mapRef.current;
		if (!map || !mapReady) return;
		if (!map.isStyleLoaded()) return;

		// Remove raster
		if (rasterLayerAddedRef.current) {
			if (map.getLayer("raster-overlay")) map.removeLayer("raster-overlay");
			if (map.getSource("raster-overlay")) map.removeSource("raster-overlay");
			rasterLayerAddedRef.current = false;
		}

		// Remove zone layers
		if (layersAddedRef.current) {
			if (map.getLayer("zones-fill")) map.removeLayer("zones-fill");
			if (map.getLayer("zones-line")) map.removeLayer("zones-line");
			if (map.getSource("zones")) map.removeSource("zones");
			layersAddedRef.current = false;
		}

		if (!geojson) return;

		map.addSource("zones", { type: "geojson", data: geojson });

		map.addLayer({
			id: "zones-fill",
			type: "fill",
			source: "zones",
			paint: {
				"fill-color": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					"rgba(16, 185, 129, 0.25)",
					"rgba(16, 185, 129, 0.06)",
				] as unknown as MapLibreGL.ExpressionSpecification,
				"fill-opacity": 1,
			},
		});

		map.addLayer({
			id: "zones-line",
			type: "line",
			source: "zones",
			paint: {
				"line-color": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					"rgba(16, 185, 129, 0.9)",
					"rgba(16, 185, 129, 0.3)",
				] as unknown as MapLibreGL.ExpressionSpecification,
				"line-width": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					2.5,
					1,
				] as unknown as MapLibreGL.ExpressionSpecification,
			},
		});

		layersAddedRef.current = true;

		// Add raster below zone fill if available
		if (rasterImageUrl && rasterBounds) {
			const [west, south, east, north] = rasterBounds;
			map.addSource("raster-overlay", {
				type: "image",
				url: rasterImageUrl,
				coordinates: [
					[west, north],
					[east, north],
					[east, south],
					[west, south],
				],
			});
			map.addLayer({
				id: "raster-overlay",
				type: "raster",
				source: "raster-overlay",
				paint: { "raster-opacity": 0.7, "raster-fade-duration": 300 },
			}, "zones-fill");
			rasterLayerAddedRef.current = true;
		}

		// Register events only once
		if (!eventsRegisteredRef.current) {
			map.on("click", "zones-fill", (e) => {
				const feature = e.features?.[0];
				if (!feature?.properties) return;
				setZone(Number(feature.properties.zone_id));
			});
			map.on("mouseenter", "zones-fill", () => { map.getCanvas().style.cursor = "pointer"; });
			map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = ""; });
			eventsRegisteredRef.current = true;
		}
	}, [geojson, mapReady, zoneId, setZone, rasterImageUrl, rasterBounds]);

	useEffect(() => { updateMapLayers(); }, [updateMapLayers]);

	// Also trigger layer update when map style loads (in case of race)
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapReady) return;
		const onStyleData = () => { setTimeout(() => updateMapLayers(), 100); };
		map.on("styledata", onStyleData);
		return () => { map.off("styledata", onStyleData); };
	}, [mapReady, updateMapLayers]);

	// Map reference handler
	const handleMapRef = useCallback((map: MapLibreGL.Map | null) => {
		if (!map) return;
		mapRef.current = map;
		const mapInstance = map;
		function checkStyleReady() {
			if (mapInstance.isStyleLoaded()) setMapReady(true);
			else setTimeout(checkStyleReady, 150);
		}
		checkStyleReady();
	}, []);

	// Select a zone from search
	const handleSelectZone = useCallback(
		(zone: ApiZone) => {
			if (zone.level_id !== levelId) setLevel(zone.level_id);
			setZone(zone.zone_id);
			setSearchOpen(false);
			setSearchQuery("");
		},
		[levelId, setLevel, setZone],
	);

	// Active variable key for display
	const activeVarKey = activeVariableId ? VARIABLE_KEY_MAP[activeVariableId] ?? "ndvi" : "ndvi";

	return (
		<div className="fixed inset-0 z-50 h-screen w-full overflow-hidden bg-background text-foreground">
			{/* Full-screen map */}
			<div className="absolute inset-0">
				<MapComponent
					ref={(ref) => handleMapRef(ref as unknown as MapLibreGL.Map | null)}
					center={INITIAL_CENTER}
					zoom={INITIAL_ZOOM}
				>
					<MapControls position="bottom-right" showZoom showCompass showLocate />
				</MapComponent>
			</div>

			{/* Zone selector — top center: collapsed/expanded */}
			<div className="absolute top-4 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 px-4">
				<div className="relative">
					{/* Collapsed: just a search pill */}
					{!searchOpen && (
						<button
							type="button"
							onClick={() => setSearchOpen(true)}
							className="flex w-full items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-all duration-200 hover:shadow-xl dark:bg-zinc-900/95"
						>
							<Search className="h-4 w-4 text-zinc-400" />
							<span className="text-sm text-zinc-500">
								{currentZone ? `${levels.find((l) => l.level_id === currentZone.level_id)?.level ?? ""} · ${currentZone.name}` : "Search zones..."}
							</span>
						</button>
					)}

					{/* Expanded: full tabs + search */}
					{searchOpen && (
						<div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in zoom-in-95 duration-200 dark:bg-zinc-900/95">
							{/* Level tabs row */}
							{levels.length > 0 && (
								<div className="relative flex items-center gap-1 border-b border-zinc-100 px-2 pt-2 pb-1.5 dark:border-zinc-800">
									{levels.map((level) => (
										<button
											key={level.level_id}
											type="button"
											onClick={() => {
												setLevel(level.level_id);
												setZone(null);
											}}
											className={`relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 ${
												levelId === level.level_id
													? "text-emerald-700 dark:text-emerald-300"
													: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
											}`}
										>
											{levelId === level.level_id && (
												<span className="absolute inset-0 animate-in fade-in zoom-in-95 duration-200 rounded-lg bg-emerald-100 dark:bg-emerald-900/40" />
											)}
											<span className="relative z-10">{level.level}</span>
										</button>
									))}
								</div>
							)}

							{/* Search input */}
							<div className="flex items-center px-2">
								<Search className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
								<input
									type="text"
									autoFocus
									placeholder={levelId ? `Search ${levels.find((l) => l.level_id === levelId)?.level ?? "zones"}...` : "Search zones..."}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
								/>
								<button
									type="button"
									onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
									className="mr-2 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
								>
									Close
								</button>
							</div>
						</div>
					)}

					{/* Search results dropdown */}
					{searchOpen && (
						<div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl bg-white/95 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 dark:bg-zinc-900/95">
							{filteredZones.map((zone) => (
								<button
									key={zone.zone_id}
									type="button"
									onClick={() => handleSelectZone(zone)}
									className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-150 hover:bg-zinc-100 active:scale-[0.98] dark:hover:bg-zinc-800 ${
										zoneId === zone.zone_id ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
									}`}
								>
									<MapPin className={`h-3.5 w-3.5 shrink-0 transition-colors ${zoneId === zone.zone_id ? "text-emerald-600" : "text-emerald-500"}`} />
									<div className="flex-1 min-w-0">
										<div className="font-medium text-zinc-900 truncate dark:text-zinc-100">{zone.name}</div>
										<div className="text-xs text-zinc-500">{zone.city} · {(zone.area / 1_000_000).toFixed(2)} km²</div>
									</div>
									<span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 capitalize dark:bg-zinc-800">
										{levels.find((l) => l.level_id === zone.level_id)?.level ?? ""}
									</span>
								</button>
							))}
							{filteredZones.length === 0 && (
								<div className="px-4 py-3 text-center text-xs text-zinc-400">No zones found</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Logo — top left */}
			<div className="absolute top-4 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<a
					href="/"
					className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md transition-all duration-200 hover:shadow-xl dark:bg-zinc-900/95"
				>
					<Leaf className="h-5 w-5 text-emerald-500" />
					<span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AgriSat</span>
				</a>
			</div>

			{/* Weather widget + theme toggle — top right (inline) */}
			<div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-right-4 duration-300">
				<div className="flex items-center gap-2">
					<ThemeToggle />
					{weatherData.length > 0 && (
						<WeatherWidget weatherData={weatherData} latestWeather={latestWeather} />
					)}
				</div>
			</div>

			{/* Bottom bar — zone info + layer timeline inline */}
			<div className="absolute bottom-5 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
				<div className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-all duration-200 dark:bg-zinc-900/95">
					{/* Zone info — clickable to expand search */}
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-0.5 transition-all duration-150 hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800"
					>
						{currentZone ? (
							<>
								<span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
									{levels.find((l) => l.level_id === currentZone.level_id)?.level ?? ""}
								</span>
								<span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{currentZone.name}</span>
							</>
						) : (
							<>
								<Layers className="h-3.5 w-3.5 text-zinc-400" />
								<span className="text-xs text-zinc-500">Select zone</span>
							</>
						)}
					</button>

					<div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />

					{/* Layer timeline inline */}
					{availableTimestamps.length > 0 ? (
						<LayerTimeline
							timestamps={availableTimestamps}
							selectedDate={selectedDate}
							onSelectDate={setSelectedDate}
							variableKey={activeVarKey}
							datePickerOpen={datePickerOpen}
							onToggleDatePicker={() => setDatePickerOpen(!datePickerOpen)}
						/>
					) : (
						<span className="flex-1 text-center text-xs text-zinc-400">No layer data</span>
					)}

					<div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />

					{/* Cloud cover with tooltip */}
					{latestWeather && (
						<div className="group relative flex shrink-0 items-center gap-1 cursor-default">
							<Cloud className="h-3 w-3 text-zinc-400" />
							<span className="text-[10px] text-zinc-500">{latestWeather.cloud_cover_pct}%</span>
							<div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900 whitespace-nowrap">
								Cloud cover
							</div>
						</div>
					)}
					{/* Area with tooltip */}
					{currentZone && (
						<div className="group relative shrink-0 cursor-default">
							<span className="text-[10px] text-zinc-500">{(currentZone.area / 1_000_000).toFixed(1)} km²</span>
							<div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900 whitespace-nowrap">
								Zone area
							</div>
						</div>
					)}
				</div>
			</div>

			{/* AI Assistant button — bottom left */}
			<div className="absolute bottom-5 left-4 z-20 animate-in fade-in slide-in-from-left-4 duration-300">
				<button
					type="button"
					className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95 dark:bg-zinc-900/95"
					aria-label="Open AI Assistant"
					onClick={() => setAiPanelOpen(true)}
				>
					<Bot className="h-4 w-4 text-emerald-500" />
					<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">AI</span>
				</button>
			</div>

			{/* AI Assistant Panel overlay */}
			{aiPanelOpen && (
				<div className="absolute bottom-16 left-4 z-30 h-[70vh] w-[380px] overflow-hidden rounded-xl border border-border shadow-xl animate-in slide-in-from-bottom-8 duration-300 [&>aside]:h-full [&>aside]:w-full [&>aside]:border-l-0">
					<AIAssistantPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
				</div>
			)}

			{/* Click outside to close overlays */}
			{(searchOpen || datePickerOpen) && (
				<div className="absolute inset-0 z-10" onClick={() => { setSearchOpen(false); setDatePickerOpen(false); }} />
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

// -----------------------------------------------------------
// Layer Timeline — slim inline version
// -----------------------------------------------------------

function LayerTimeline({
	timestamps,
	selectedDate,
	onSelectDate,
	variableKey,
	datePickerOpen,
	onToggleDatePicker,
}: {
	timestamps: Date[];
	selectedDate: Date | null;
	onSelectDate: (date: Date) => void;
	variableKey: string;
	datePickerOpen: boolean;
	onToggleDatePicker: () => void;
}) {
	const [isPlaying, setIsPlaying] = useState(false);
	const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const selectedIdx = useMemo(() => {
		if (!selectedDate) return timestamps.length - 1;
		const target = dayjs(selectedDate).format("YYYY-MM-DD");
		const idx = timestamps.findIndex((t) => dayjs(t).format("YYYY-MM-DD") === target);
		return idx >= 0 ? idx : timestamps.length - 1;
	}, [selectedDate, timestamps]);

	useEffect(() => {
		if (!isPlaying) {
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
			playIntervalRef.current = null;
			return;
		}
		playIntervalRef.current = setInterval(() => {
			onSelectDate(timestamps[(selectedIdx + 1) % timestamps.length]);
		}, 1200);
		return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
	}, [isPlaying, selectedIdx, timestamps, onSelectDate]);

	const handlePrev = () => { if (selectedIdx > 0) onSelectDate(timestamps[selectedIdx - 1]); };
	const handleNext = () => { if (selectedIdx < timestamps.length - 1) onSelectDate(timestamps[selectedIdx + 1]); };
	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const idx = Number(e.target.value);
		if (idx >= 0 && idx < timestamps.length) onSelectDate(timestamps[idx]);
	};

	return (
		<div className="relative flex flex-1 items-center gap-2">
			{/* Variable badge */}
			<span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
				{variableKey}
			</span>

			{/* Prev */}
			<button type="button" onClick={handlePrev} disabled={selectedIdx === 0} className="shrink-0 rounded p-0.5 text-zinc-400 transition-all duration-150 hover:text-zinc-700 active:scale-90 disabled:opacity-30 dark:hover:text-zinc-300" aria-label="Previous date">
				<ChevronLeft className="h-3.5 w-3.5" />
			</button>

			{/* Play/pause */}
			<button type="button" onClick={() => setIsPlaying(!isPlaying)} className={`shrink-0 rounded p-0.5 transition-all duration-150 active:scale-90 ${isPlaying ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"}`} aria-label={isPlaying ? "Pause" : "Play"}>
				{isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
			</button>

			{/* Slider */}
			<input
				type="range"
				min={0}
				max={timestamps.length - 1}
				value={selectedIdx}
				onChange={handleSliderChange}
				className="h-1 min-w-[80px] flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-emerald-500 dark:bg-zinc-700 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-125 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:shadow-sm"
			/>

			{/* Next */}
			<button type="button" onClick={handleNext} disabled={selectedIdx === timestamps.length - 1} className="shrink-0 rounded p-0.5 text-zinc-400 transition-all duration-150 hover:text-zinc-700 active:scale-90 disabled:opacity-30 dark:hover:text-zinc-300" aria-label="Next date">
				<ChevronRight className="h-3.5 w-3.5" />
			</button>

			{/* Date label — clickable to show date picker */}
			<button
				type="button"
				onClick={onToggleDatePicker}
				className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700 transition-all duration-150 hover:bg-zinc-100 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800"
			>
				{selectedDate ? dayjs(selectedDate).format("D MMM YY") : "—"}
			</button>

			{/* Date picker dropdown */}
			{datePickerOpen && (
				<div className="absolute bottom-full right-0 mb-2 w-48 max-h-48 overflow-y-auto rounded-xl bg-white/95 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 dark:bg-zinc-900/95">
					{timestamps.map((ts, idx) => (
						<button
							key={ts.getTime()}
							type="button"
							onClick={() => { onSelectDate(ts); onToggleDatePicker(); }}
							className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
								selectedIdx === idx ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-300"
							}`}
						>
							{dayjs(ts).format("D MMMM YYYY")}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// -----------------------------------------------------------
// Weather Widget with expandable timeline
// -----------------------------------------------------------

function WeatherWidget({
	weatherData,
	latestWeather,
}: {
	weatherData: WeatherTimePoint[];
	latestWeather: WeatherTimePoint | null;
}) {
	const [expanded, setExpanded] = useState(false);

	const chartData = useMemo(() => {
		return weatherData.map((d) => {
			const tempRaw = d.temperature;
			const tempC = tempRaw > 100 ? tempRaw - 273.15 : tempRaw;
			return {
				date: dayjs(d.timestamp).format("MMM D"),
				temperature: Number(tempC.toFixed(1)),
				precipitation: d.precipitation,
				cloudCover: d.cloud_cover_pct,
			};
		});
	}, [weatherData]);

	return (
		<div className="w-64 rounded-xl bg-white/95 shadow-lg backdrop-blur-md transition-all duration-200 dark:bg-zinc-900/95">
			{/* Summary row */}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl"
			>
				{latestWeather?.is_raining ? (
					<CloudRain className="h-5 w-5 text-blue-500 transition-transform duration-200" />
				) : (
					<Cloud className="h-5 w-5 text-zinc-400 transition-transform duration-200" />
				)}
				{latestWeather && (
					<>
						<div className="flex items-baseline gap-1">
							<span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
								{latestWeather.temperature > 100
									? (latestWeather.temperature - 273.15).toFixed(0)
									: latestWeather.temperature.toFixed(0)}°
							</span>
							<span className="text-xs text-zinc-500">C</span>
						</div>
						<div className="flex items-center gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-700">
							<Droplets className="h-3.5 w-3.5 text-blue-400" />
							<span className="text-xs text-zinc-600 dark:text-zinc-400">
								{latestWeather.precipitation.toFixed(1)}mm
							</span>
						</div>
					</>
				)}
				<div className="ml-auto">
					<div className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
						<ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
					</div>
				</div>
			</button>

			{/* Expanded timeline chart */}
			<div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded && chartData.length > 1 ? "max-h-60 opacity-100" : "max-h-0 opacity-0"}`}>
				<div className="border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-800">
					{/* Temperature */}
					<div className="mb-1 text-[10px] font-medium text-zinc-500">Temperature</div>
					<ResponsiveContainer width="100%" height={60}>
						<AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
							<defs>
								<linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0.3} />
									<stop offset="100%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis dataKey="date" tick={{ fontSize: 8, fill: "currentColor" }} tickLine={false} axisLine={false} interval="preserveStartEnd" className="text-zinc-400" />
							<YAxis hide domain={["auto", "auto"]} />
							<Tooltip contentStyle={{ fontSize: 10, backgroundColor: "var(--color-background, #fff)", border: "1px solid var(--color-border, #e4e4e7)", borderRadius: 6, padding: "4px 8px" }} formatter={(value) => [`${Number(value)}°C`, "Temp"]} labelStyle={{ fontSize: 9 }} />
							<Area type="monotone" dataKey="temperature" stroke="hsl(25, 95%, 53%)" fill="url(#tempGrad)" strokeWidth={1.5} dot={false} />
						</AreaChart>
					</ResponsiveContainer>

					{/* Precipitation */}
					<div className="mt-2 mb-1 text-[10px] font-medium text-zinc-500">Precipitation</div>
					<ResponsiveContainer width="100%" height={40}>
						<LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
							<XAxis dataKey="date" tick={{ fontSize: 8, fill: "currentColor" }} tickLine={false} axisLine={false} interval="preserveStartEnd" className="text-zinc-400" />
							<YAxis hide domain={[0, "auto"]} />
							<Tooltip contentStyle={{ fontSize: 10, backgroundColor: "var(--color-background, #fff)", border: "1px solid var(--color-border, #e4e4e7)", borderRadius: 6, padding: "4px 8px" }} formatter={(value) => [`${Number(value).toFixed(2)}mm`, "Rain"]} labelStyle={{ fontSize: 9 }} />
							<Line type="monotone" dataKey="precipitation" stroke="hsl(210, 80%, 55%)" strokeWidth={1.5} dot={false} />
						</LineChart>
					</ResponsiveContainer>

					<div className="mt-1 text-center text-[9px] text-zinc-400">
						{chartData[0]?.date} — {chartData[chartData.length - 1]?.date}
					</div>
				</div>
			</div>
		</div>
	);
}

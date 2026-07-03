import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import MapLibreGL from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import dayjs from "dayjs";
import { Home, Crosshair, RectangleHorizontal, Minus, Plus, Compass } from "lucide-react";

import { Map as MapComponent } from "#/components/ui/map";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { httpClient } from "#/services/api";
import type { Zone as ApiZone } from "#/services/api";
import { useControls, useQueryContext } from "./ControlProvider";
import { cn } from "#/lib/utils";

const INITIAL_CENTER: [number, number] = [106.8, -6.6];
const INITIAL_ZOOM = 11;
const MIN_ZOOM = 6;
const MAX_ZOOM = 20;

const HOME_CENTER: [number, number] = [106.8, -6.6];
const HOME_ZOOM = 10;

const mapLayerKeys = {
	polygons: (levelId: number | null) => ["map", "polygons", levelId] as const,
	raster: (variableId: number | null, date: string | null) =>
		["map", "raster", variableId, date] as const,
};

async function fetchPolygons(levelId: number): Promise<FeatureCollection> {
	return httpClient
		.get("layers/polygons", { searchParams: { level_id: levelId } })
		.json<FeatureCollection>();
}

// Cache blob URLs so they survive React re-renders and aren't revoked prematurely.
// Each unique variable+date combo gets one blob URL that persists until explicitly evicted.
const blobCache = new Map<string, string>();
const BLOB_CACHE_MAX = 20;

function blobCacheKey(variableId: number, ts: string) {
	return `${variableId}__${ts}`;
}

function evictOldestBlobs() {
	while (blobCache.size > BLOB_CACHE_MAX) {
		const firstKey = blobCache.keys().next().value!;
		const url = blobCache.get(firstKey)!;
		URL.revokeObjectURL(url);
		blobCache.delete(firstKey);
	}
}

async function fetchRasterBlob(variableId: number, ts: string): Promise<string | null> {
	const key = blobCacheKey(variableId, ts);
	const cached = blobCache.get(key);
	if (cached) return cached;

	const response = await httpClient.get("layers/rasters", {
		searchParams: { variable_id: variableId, ts },
		throwHttpErrors: false,
	});
	if (!response.ok) return null;
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	blobCache.set(key, url);
	evictOldestBlobs();
	return url;
}

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

type ToolMode = "pan" | "box-zoom";

interface MapToolbarProps {
	mapRef: React.RefObject<MapLibreGL.Map | null>;
	zoneBoundsRef: React.RefObject<MapLibreGL.LngLatBoundsLike | null>;
	mode: ToolMode;
	onModeChange: (mode: ToolMode) => void;
}

function ToolbarBtn({
	onClick,
	active,
	title,
	children,
}: {
	onClick: () => void;
	active?: boolean;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onClick}
					className={cn(
						"flex h-8 w-8 items-center justify-center transition-all duration-150",
						"hover:bg-zinc-100 dark:hover:bg-zinc-800",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset",
						active && "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
						!active && "text-zinc-500 dark:text-zinc-400",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="left" sideOffset={8}>
				{title}
			</TooltipContent>
		</Tooltip>
	);
}

function ToolbarDivider() {
	return <div className="mx-1 h-px bg-zinc-200 dark:bg-zinc-700" />;
}

function MapToolbar({ mapRef, zoneBoundsRef, mode, onModeChange }: MapToolbarProps) {
	const handleZoomIn = () => {
		const map = mapRef.current;
		if (!map) return;
		map.zoomTo(map.getZoom() + 1, { duration: 250 });
	};

	const handleZoomOut = () => {
		const map = mapRef.current;
		if (!map) return;
		map.zoomTo(map.getZoom() - 1, { duration: 250 });
	};

	const handleHome = () => {
		const map = mapRef.current;
		if (!map) return;
		map.flyTo({ center: HOME_CENTER, zoom: HOME_ZOOM, duration: 900 });
	};

	const handlePanToZone = () => {
		const map = mapRef.current;
		const bounds = zoneBoundsRef.current;
		if (!map || !bounds) return;
		map.fitBounds(bounds, { padding: 60, duration: 700 });
	};

	const handleResetNorth = () => {
		const map = mapRef.current;
		if (!map) return;
		map.resetNorthPitch({ duration: 300 });
	};

	const toggleBoxZoom = () => {
		onModeChange(mode === "box-zoom" ? "pan" : "box-zoom");
	};

	return (
		<div className="absolute bottom-[4.5rem] md:bottom-[2.5rem] right-4 z-20 flex flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white/95 shadow-lg backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/95">
			<ToolbarBtn onClick={handleZoomIn} title="Zoom in">
				<Plus className="h-4 w-4" />
			</ToolbarBtn>
			<ToolbarBtn onClick={handleZoomOut} title="Zoom out">
				<Minus className="h-4 w-4" />
			</ToolbarBtn>

			<ToolbarDivider />

			<ToolbarBtn onClick={handleResetNorth} title="Reset north">
				<Compass className="h-4 w-4" />
			</ToolbarBtn>

			<ToolbarDivider />

			<ToolbarBtn onClick={handleHome} title="Home — Bogor overview">
				<Home className="h-4 w-4" />
			</ToolbarBtn>

			<ToolbarBtn onClick={handlePanToZone} title="Pan to selected zone">
				<Crosshair className="h-4 w-4" />
			</ToolbarBtn>

			<ToolbarDivider />
			<ToolbarBtn
				onClick={toggleBoxZoom}
				active={mode === "box-zoom"}
				title={mode === "box-zoom" ? "Exit box zoom (Esc)" : "Box zoom — drag a rectangle to zoom"}
			>
				<RectangleHorizontal className="h-4 w-4" />
			</ToolbarBtn>
		</div>
	);
}

interface BoxZoomOverlayProps {
	mapRef: React.RefObject<MapLibreGL.Map | null>;
	active: boolean;
	onDeactivate: () => void;
}

function BoxZoomOverlay({ mapRef, active, onDeactivate }: BoxZoomOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const startRef = useRef<{ x: number; y: number } | null>(null);
	const boxRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!active) return;

		const container = containerRef.current;
		if (!container) return;

		// Create rubber-band div once
		const box = document.createElement("div");
		box.style.cssText = `
			position: absolute;
			border: 2px solid #10b981;
			background: rgba(16,185,129,0.08);
			pointer-events: none;
			display: none;
			border-radius: 2px;
		`;
		container.appendChild(box);
		boxRef.current = box;

		function onMouseDown(e: MouseEvent) {
			if (e.button !== 0) return;
			e.preventDefault();
			const rect = container!.getBoundingClientRect();
			startRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
			box.style.left = `${startRef.current.x}px`;
			box.style.top = `${startRef.current.y}px`;
			box.style.width = "0px";
			box.style.height = "0px";
			box.style.display = "block";
		}

		function onMouseMove(e: MouseEvent) {
			if (!startRef.current) return;
			const rect = container!.getBoundingClientRect();
			const curX = e.clientX - rect.left;
			const curY = e.clientY - rect.top;
			const x = Math.min(startRef.current.x, curX);
			const y = Math.min(startRef.current.y, curY);
			const w = Math.abs(curX - startRef.current.x);
			const h = Math.abs(curY - startRef.current.y);
			box.style.left = `${x}px`;
			box.style.top = `${y}px`;
			box.style.width = `${w}px`;
			box.style.height = `${h}px`;
		}

		function onMouseUp(e: MouseEvent) {
			if (!startRef.current) return;
			const rect = container!.getBoundingClientRect();
			const endX = e.clientX - rect.left;
			const endY = e.clientY - rect.top;
			const x0 = Math.min(startRef.current.x, endX);
			const y0 = Math.min(startRef.current.y, endY);
			const x1 = Math.max(startRef.current.x, endX);
			const y1 = Math.max(startRef.current.y, endY);

			box.style.display = "none";
			startRef.current = null;

			if (x1 - x0 > 10 && y1 - y0 > 10) {
				const map = mapRef.current;
				if (map) {
					const sw = map.unproject([x0, y1]);
					const ne = map.unproject([x1, y0]);
					map.fitBounds([sw, ne], { padding: 20, duration: 500 });
				}
			}
			onDeactivate();
		}

		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				box.style.display = "none";
				startRef.current = null;
				onDeactivate();
			}
		}

		container.addEventListener("mousedown", onMouseDown);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		window.addEventListener("keydown", onKeyDown);

		return () => {
			container.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			window.removeEventListener("keydown", onKeyDown);
			box.remove();
			boxRef.current = null;
		};
	}, [active, mapRef, onDeactivate]);

	if (!active) return null;

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 z-10 cursor-crosshair"
			onMouseDown={(e) => e.stopPropagation()}
		/>
	);
}

interface MapOverlayProps {
	zones: ApiZone[];
}

export const MapOverlay = memo(function MapOverlay({ zones }: MapOverlayProps) {
	// Store slices
	const levelId = useQueryContext((s) => s.levelId);
	const zoneId = useQueryContext((s) => s.zoneId);
	const activeVariableId = useQueryContext((s) => s.activeVariableId);
	const setLevel = useQueryContext((s) => s.setLevel);
	const setZone = useQueryContext((s) => s.setZone);
	const selectedDate = useControls((s) => s.selectedDate);

	const zoneName = useMemo(() => {
		if (!zoneId) return null;
		return zones.find((z) => z.zone_id === zoneId)?.name ?? null;
	}, [zoneId, zones]);

	const [toolMode, setToolMode] = useState<ToolMode>("pan");

	const handleModeChange = useCallback((mode: ToolMode) => {
		setToolMode(mode);
		const map = mapRef.current;
		if (!map) return;
		if (mode === "box-zoom") {
			map.dragPan.disable();
			map.dragRotate.disable();
		} else {
			map.dragPan.enable();
			map.dragRotate.enable();
		}
	}, []);

	const handleBoxZoomDeactivate = useCallback(() => {
		setToolMode("pan");
		const map = mapRef.current;
		if (map) {
			map.dragPan.enable();
			map.dragRotate.enable();
		}
	}, []);

	const mapRef = useRef<MapLibreGL.Map | null>(null);
	const mapReadyRef = useRef(false);
	const layersAddedRef = useRef(false);
	const rasterLayerAddedRef = useRef(false);
	const eventsRegisteredRef = useRef(false);
	const displayedRasterUrlRef = useRef<string | null>(null);

	const zonesRef = useRef(zones);
	zonesRef.current = zones;
	const setLevelRef = useRef(setLevel);
	setLevelRef.current = setLevel;
	const setZoneRef = useRef(setZone);
	setZoneRef.current = setZone;
	const levelIdRef = useRef(levelId);
	levelIdRef.current = levelId;
	const zoneNameRef = useRef(zoneName);
	zoneNameRef.current = zoneName;
	const rasterBoundsRef = useRef<[number, number, number, number] | null>(null);
	const geojsonRef = useRef<FeatureCollection | undefined>(undefined);
	const rasterImageUrlRef = useRef<string | null | undefined>(undefined);

	const zoneBoundsRef = useRef<MapLibreGL.LngLatBoundsLike | null>(null);

	const dateStr = selectedDate ? dayjs(selectedDate).format("YYYY-MM-DD") : null;

	const { data: geojson } = useQuery({
		queryKey: mapLayerKeys.polygons(levelId),
		queryFn: () => fetchPolygons(levelId!),
		enabled: levelId !== null,
		staleTime: 10 * 60 * 1000,
		placeholderData: keepPreviousData,
	});

	const { data: rasterImageUrl } = useQuery({
		queryKey: mapLayerKeys.raster(activeVariableId, dateStr),
		queryFn: () => fetchRasterBlob(activeVariableId!, dateStr!),
		enabled: activeVariableId !== null && dateStr !== null,
		staleTime: 10 * 60 * 1000,
		placeholderData: keepPreviousData,
	});

	// Blob URL lifecycle is managed by the module-level blobCache.
	// No eager revokeObjectURL here — URLs stay valid while the map uses them.
	rasterImageUrlRef.current = rasterImageUrl;

	if (geojson) {
		const bounds = computeBounds(geojson);
		if (bounds) {
			const [[west, south], [east, north]] = bounds as [[number, number], [number, number]];
			const next: [number, number, number, number] = [west, south, east, north];
			const cur = rasterBoundsRef.current;
			if (!cur || cur[0] !== next[0] || cur[1] !== next[1] || cur[2] !== next[2] || cur[3] !== next[3]) {
				rasterBoundsRef.current = next;
			}
			zoneBoundsRef.current = [[west, south], [east, north]];
		} else {
			rasterBoundsRef.current = null;
			zoneBoundsRef.current = null;
		}
	}

	// Blob URL cleanup
	// No-op: lifecycle managed by module-level blobCache with LRU eviction.

	const syncZoneLayers = useCallback(() => {
		const map = mapRef.current;
		if (!map || !mapReadyRef.current || !map.isStyleLoaded()) return;

		if (layersAddedRef.current) {
			if (map.getLayer("zones-fill")) map.removeLayer("zones-fill");
			if (map.getLayer("zones-line")) map.removeLayer("zones-line");
			if (map.getSource("zones")) map.removeSource("zones");
			layersAddedRef.current = false;
		}

		const geojson = geojsonRef.current;
		if (!geojson) return;

		map.addSource("zones", { type: "geojson", data: geojson });
		const activeName = zoneNameRef.current ?? "";

		map.addLayer({
			id: "zones-fill",
			type: "fill",
			source: "zones",
			paint: {
				"fill-color": ["case", ["==", ["get", "name"], activeName], "rgba(16, 185, 129, 0.25)", "rgba(16, 185, 129, 0.06)"] as unknown as MapLibreGL.ExpressionSpecification,
				"fill-opacity": 1,
			},
		});
		map.addLayer({
			id: "zones-line",
			type: "line",
			source: "zones",
			paint: {
				"line-color": ["case", ["==", ["get", "name"], activeName], "rgba(16, 185, 129, 0.9)", "rgba(16, 185, 129, 0.3)"] as unknown as MapLibreGL.ExpressionSpecification,
				"line-width": ["case", ["==", ["get", "name"], activeName], 2.5, 1] as unknown as MapLibreGL.ExpressionSpecification,
			},
		});
		layersAddedRef.current = true;

		if (!eventsRegisteredRef.current) {
			map.on("click", "zones-fill", (e) => {
				const feature = e.features?.[0];
				if (!feature?.properties) return;
				const name = feature.properties.name;
				if (typeof name === "string" && name) {
					const zone = zonesRef.current.find((z) => z.name === name);
					if (!zone) return;
					if (zone.level_id !== levelIdRef.current) setLevelRef.current(zone.level_id);
					setZoneRef.current(zone.zone_id);
				}
			});
			map.on("mouseenter", "zones-fill", () => { map.getCanvas().style.cursor = "pointer"; });
			map.on("mouseleave", "zones-fill", () => { map.getCanvas().style.cursor = ""; });
			eventsRegisteredRef.current = true;
		}
	}, []);

	const applyRasterLayer = useCallback(() => {
		const map = mapRef.current;
		if (!map || !mapReadyRef.current || !map.isStyleLoaded()) return;

		const currentUrl = rasterImageUrlRef.current ?? null;
		const bounds = rasterBoundsRef.current;

		if (currentUrl === displayedRasterUrlRef.current) return;

		if (rasterLayerAddedRef.current) {
			if (map.getLayer("raster-overlay")) map.removeLayer("raster-overlay");
			if (map.getSource("raster-overlay")) map.removeSource("raster-overlay");
			rasterLayerAddedRef.current = false;
		}

		displayedRasterUrlRef.current = currentUrl;
		if (!currentUrl || !bounds) return;

		const [west, south, east, north] = bounds;
		map.addSource("raster-overlay", {
			type: "image",
			url: currentUrl,
			coordinates: [[west, north], [east, north], [east, south], [west, south]],
		});
		const beforeLayer = map.getLayer("zones-fill") ? "zones-fill" : undefined;
		map.addLayer({ id: "raster-overlay", type: "raster", source: "raster-overlay", paint: { "raster-opacity": 0.7, "raster-fade-duration": 300 } }, beforeLayer);
		rasterLayerAddedRef.current = true;
	}, []);

	const updateHighlight = useCallback(() => {
		const map = mapRef.current;
		if (!map || !mapReadyRef.current || !layersAddedRef.current || !map.isStyleLoaded()) return;
		const activeName = zoneNameRef.current ?? "";
		try {
			if (map.getLayer("zones-fill")) {
				map.setPaintProperty("zones-fill", "fill-color", ["case", ["==", ["get", "name"], activeName], "rgba(16, 185, 129, 0.25)", "rgba(16, 185, 129, 0.06)"]);
			}
			if (map.getLayer("zones-line")) {
				map.setPaintProperty("zones-line", "line-color", ["case", ["==", ["get", "name"], activeName], "rgba(16, 185, 129, 0.9)", "rgba(16, 185, 129, 0.3)"]);
				map.setPaintProperty("zones-line", "line-width", ["case", ["==", ["get", "name"], activeName], 2.5, 1]);
			}
		} catch { /* not ready */ }
	}, []);

	const handleMapRef = useCallback((map: MapLibreGL.Map | null) => {
		if (!map) return;
		mapRef.current = map;
		const mapInstance = map;

		mapInstance.on("style.load", () => {
			layersAddedRef.current = false;
			rasterLayerAddedRef.current = false;
			displayedRasterUrlRef.current = null;
			syncZoneLayers();
			applyRasterLayer();
		});

		function checkStyleReady() {
			if (mapInstance.isStyleLoaded()) {
				mapReadyRef.current = true;
				syncZoneLayers();
				applyRasterLayer();
			} else {
				setTimeout(checkStyleReady, 150);
			}
		}
		checkStyleReady();
	}, [syncZoneLayers, applyRasterLayer]);

	useEffect(() => {
		geojsonRef.current = geojson;
		syncZoneLayers();
	}, [geojson, syncZoneLayers]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapReadyRef.current || !geojson?.features?.length) return;
		const bounds = computeBounds(geojson);
		if (!bounds) return;
		const timer = setTimeout(() => {
			try { map.fitBounds(bounds, { padding: 60, duration: 800 }); } catch { /* ignore */ }
		}, 200);
		return () => clearTimeout(timer);
	}, [geojson]);

	useEffect(() => {
		displayedRasterUrlRef.current = null;
		applyRasterLayer();
	}, [rasterImageUrl, applyRasterLayer]);

	useEffect(() => {
		applyRasterLayer();
	}, [geojson, applyRasterLayer]);

	useEffect(() => {
		updateHighlight();
	}, [zoneName, updateHighlight]);

	return (
		<div className="absolute inset-0">
			<MapComponent
				ref={handleMapRef as unknown as React.Ref<MapLibreGL.Map>}
				center={INITIAL_CENTER}
				zoom={INITIAL_ZOOM}
				minZoom={MIN_ZOOM}
				maxZoom={MAX_ZOOM}
			/>

			<BoxZoomOverlay
				mapRef={mapRef}
				active={toolMode === "box-zoom"}
				onDeactivate={handleBoxZoomDeactivate}
			/>

			<MapToolbar
				mapRef={mapRef}
				zoneBoundsRef={zoneBoundsRef}
				mode={toolMode}
				onModeChange={handleModeChange}
			/>
		</div>
	);
});

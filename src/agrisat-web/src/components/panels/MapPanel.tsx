import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import MapLibreGL from "maplibre-gl";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import dayjs from "dayjs";

import { Card, CardContent } from "#/components/ui/card";
import { Map as MapComponent, MapControls } from "#/components/ui/map";
import { httpClient } from "#/services/api";
import type { EnvironmentalTimePoint } from "#/types/api";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

export interface ZoneAverage {
	zoneId: number;
	average: number;
}

export interface MapPanelProps {
	store: ReturnType<typeof import("#/stores/query-context").createQueryContextStore>;
	/** Per-zone averages for the active variable, used for heatmap coloring */
	zoneAverages?: ZoneAverage[];
	/** Environmental data for computing zone averages if not provided externally */
	environmentalData?: EnvironmentalTimePoint[];
}

// -----------------------------------------------------------
// Constants
// -----------------------------------------------------------

const INITIAL_CENTER: [number, number] = [106.8, -6.6];
const INITIAL_ZOOM = 11;

const ZONE_FILL_LAYER_ID = "zones-fill";
const ZONE_LINE_LAYER_ID = "zones-line";
const ZONE_HEATMAP_FILL_LAYER_ID = "zones-heatmap-fill";
const ZONES_SOURCE_ID = "zones";

const RASTER_SOURCE_ID = "raster-overlay";
const RASTER_LAYER_ID = "raster-overlay-layer";

const BOGOR_BOUNDARY_SOURCE_ID = "bogor-boundary";
const BOGOR_BOUNDARY_FILL_LAYER_ID = "bogor-boundary-fill";
const BOGOR_BOUNDARY_LINE_LAYER_ID = "bogor-boundary-line";

// -----------------------------------------------------------
// Color scale utilities
// -----------------------------------------------------------

export function getHeatmapColor(normalizedValue: number): string {
	const clamped = Math.max(0, Math.min(1, normalizedValue));
	const r = Math.round(clamped < 0.5 ? 220 : 220 - (clamped - 0.5) * 2 * 180);
	const g = Math.round(clamped < 0.5 ? clamped * 2 * 200 : 200);
	const b = Math.round(40);
	return `rgba(${r}, ${g}, ${b}, 0.55)`;
}

export function computeZoneAverages(
	data: EnvironmentalTimePoint[],
	variableKey: string,
): ZoneAverage[] {
	const zoneMap = new Map<number, { sum: number; count: number }>();

	for (const point of data) {
		const value = (point as unknown as Record<string, unknown>)[variableKey];
		if (typeof value !== "number") continue;

		const existing = zoneMap.get(point.zone_id);
		if (existing) {
			existing.sum += value;
			existing.count += 1;
		} else {
			zoneMap.set(point.zone_id, { sum: value, count: 1 });
		}
	}

	const result: ZoneAverage[] = [];
	for (const [zoneId, { sum, count }] of zoneMap) {
		result.push({ zoneId, average: sum / count });
	}
	return result;
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

export function getVariableKey(variableId: number): string {
	return VARIABLE_KEY_MAP[variableId] ?? "ndvi";
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

/** Compute bounding box from a GeoJSON FeatureCollection */
function computeBounds(geojson: FeatureCollection): MapLibreGL.LngLatBoundsLike | null {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;

	function processCoords(coords: number[]) {
		if (coords.length < 2) return;
		const [lng, lat] = coords;
		// Validate coordinate ranges
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

	// Validate we found valid bounds
	if (minLng === Infinity || minLat === Infinity || maxLng === -Infinity || maxLat === -Infinity) return null;
	if (minLng > maxLng || minLat > maxLat) return null;
	// Final sanity check
	if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
	// Avoid degenerate (zero-area) bounds
	if (minLng === maxLng && minLat === maxLat) return null;

	return [[minLng, minLat], [maxLng, maxLat]];
}

/** Compute bounding box for a single feature */
function computeFeatureBounds(feature: Feature): MapLibreGL.LngLatBoundsLike | null {
	const fc: FeatureCollection = { type: "FeatureCollection", features: [feature] };
	return computeBounds(fc);
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export default function MapPanel({ store, zoneAverages, environmentalData }: MapPanelProps) {
	const levelId = useStore(store, (s) => s.levelId);
	const zoneId = useStore(store, (s) => s.zoneId);
	const activeVariableId = useStore(store, (s) => s.activeVariableId);
	const timeRange = useStore(store, (s) => s.timeRange);
	const setZone = useStore(store, (s) => s.setZone);

	const mapRef = useRef<MapLibreGL.Map | null>(null);
	const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
	const [bogorBoundary, setBogorBoundary] = useState<FeatureCollection | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [rasterUnavailable, setRasterUnavailable] = useState(false);
	const [rasterImageUrl, setRasterImageUrl] = useState<string | null>(null);
	const [rasterBounds, setRasterBounds] = useState<[number, number, number, number] | null>(null);
	const [mapReady, setMapReady] = useState(false);

	const layersAddedRef = useRef(false);
	const bogorLayerAddedRef = useRef(false);
	const rasterLayerAddedRef = useRef(false);
	const prevZoneIdRef = useRef<number | null>(null);

	// -----------------------------------------------------------
	// Fetch Bogor region boundary (extent level) once on mount
	// -----------------------------------------------------------
	useEffect(() => {
		let cancelled = false;

		async function fetchBogorBoundary() {
			try {
				// Level 1 is "extent" — the full Bogor region boundary
				const res = await httpClient
					.get("layers/polygons", { searchParams: { level_id: 1 } })
					.json<FeatureCollection>();

				if (!cancelled) {
					setBogorBoundary(res);
				}
			} catch {
				// Non-critical — silently ignore if boundary can't be loaded
			}
		}

		fetchBogorBoundary();
		return () => { cancelled = true; };
	}, []);

	// -----------------------------------------------------------
	// Fetch GeoJSON polygons when level changes
	// -----------------------------------------------------------
	useEffect(() => {
		if (levelId === null) {
			setGeojson(null);
			setLoadError(null);
			return;
		}

		let cancelled = false;

		async function fetchPolygons() {
			try {
				const res = await httpClient
					.get("layers/polygons", { searchParams: { level_id: levelId! } })
					.json<FeatureCollection>();

				if (!cancelled) {
					setGeojson(res);
					setLoadError(null);
				}
			} catch {
				if (!cancelled) {
					setGeojson(null);
					setLoadError("Failed to load zone polygons.");
				}
			}
		}

		fetchPolygons();
		return () => { cancelled = true; };
	}, [levelId]);

	// -----------------------------------------------------------
	// Fit map to GeoJSON bounds when polygons load
	// -----------------------------------------------------------
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !geojson || !mapReady) return;
		if (!geojson.features || geojson.features.length === 0) return;

		const bounds = computeBounds(geojson);
		if (!bounds) return;

		// Validate bounds before calling fitBounds
		const [[swLng, swLat], [neLng, neLat]] = bounds as [[number, number], [number, number]];
		if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) return;
		if (swLng < -180 || swLng > 180 || neLng < -180 || neLng > 180) return;

		// Small delay to ensure map is fully initialized after style load
		const timer = setTimeout(() => {
			try {
				map.fitBounds(bounds, { padding: 40, duration: 800 });
			} catch (e) {
				console.warn("[MapPanel] fitBounds failed:", e);
			}
		}, 200);

		return () => clearTimeout(timer);
	}, [geojson, mapReady]);

	// -----------------------------------------------------------
	// Pan/zoom to selected zone
	// -----------------------------------------------------------
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !geojson || !mapReady) return;
		if (!geojson.features || geojson.features.length === 0) return;

		// Only fly when zone changes (not on initial render with null)
		if (zoneId === prevZoneIdRef.current) return;
		prevZoneIdRef.current = zoneId;

		if (zoneId === null) {
			// Zoom back to full extent when deselecting
			const bounds = computeBounds(geojson);
			if (bounds) {
				try {
					map.fitBounds(bounds, { padding: 40, duration: 600 });
				} catch {
					// Ignore invalid bounds errors
				}
			}
			return;
		}

		// Find the feature for this zone
		const feature = geojson.features.find(
			(f) => f.properties?.zone_id === zoneId,
		);
		if (!feature) return;

		const featureBounds = computeFeatureBounds(feature);
		if (!featureBounds) return;

		// Validate bounds
		const [[swLng, swLat], [neLng, neLat]] = featureBounds as [[number, number], [number, number]];
		if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) return;
		if (swLng < -180 || swLng > 180 || neLng < -180 || neLng > 180) return;

		try {
			map.fitBounds(featureBounds, { padding: 60, duration: 600, maxZoom: 15 });
		} catch {
			// Ignore invalid bounds errors
		}
	}, [zoneId, geojson, mapReady]);

	// -----------------------------------------------------------
	// Fetch raster overlay when active variable or time range changes
	// -----------------------------------------------------------
	useEffect(() => {
		if (activeVariableId === null || !timeRange) {
			setRasterUnavailable(false);
			setRasterImageUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
			setRasterBounds(null);
			return;
		}

		let cancelled = false;

		async function fetchRaster() {
			try {
				const ts = dayjs(timeRange.endTs).format("YYYY-MM-DD");
				const response = await httpClient.get("layers/rasters", {
					searchParams: {
						variable_id: activeVariableId!,
						ts,
					},
					throwHttpErrors: false,
				});

				if (cancelled) return;

				if (response.status === 404 || !response.ok) {
					setRasterUnavailable(true);
					setRasterImageUrl((prev) => {
						if (prev) URL.revokeObjectURL(prev);
						return null;
					});
					setRasterBounds(null);
				} else {
					// Successfully fetched raster image
					const blob = await response.blob();
					if (cancelled) return;

					const imageUrl = URL.createObjectURL(blob);
					setRasterImageUrl((prev) => {
						if (prev) URL.revokeObjectURL(prev);
						return imageUrl;
					});
					setRasterUnavailable(false);
				}
			} catch {
				if (!cancelled) {
					setRasterUnavailable(true);
					setRasterImageUrl((prev) => {
						if (prev) URL.revokeObjectURL(prev);
						return null;
					});
					setRasterBounds(null);
				}
			}
		}

		fetchRaster();
		return () => { cancelled = true; };
	}, [activeVariableId, timeRange]);

	// -----------------------------------------------------------
	// Compute raster bounds from the Bogor boundary (extent level)
	// The raster covers the full study area, so we use the extent bounds.
	// -----------------------------------------------------------
	useEffect(() => {
		const boundsSource = bogorBoundary ?? geojson;
		if (!boundsSource) {
			setRasterBounds(null);
			return;
		}

		const bounds = computeBounds(boundsSource);
		if (!bounds) {
			setRasterBounds(null);
			return;
		}

		const [[west, south], [east, north]] = bounds as [[number, number], [number, number]];
		setRasterBounds([west, south, east, north]);
	}, [bogorBoundary, geojson]);

	// Clean up object URL on unmount
	useEffect(() => {
		return () => {
			setRasterImageUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		};
	}, []);

	// -----------------------------------------------------------
	// Compute zone heatmap colors
	// -----------------------------------------------------------
	const effectiveZoneAverages = useMemo(() => {
		if (zoneAverages && zoneAverages.length > 0) {
			return zoneAverages;
		}
		if (environmentalData && activeVariableId !== null) {
			const varKey = getVariableKey(activeVariableId);
			return computeZoneAverages(environmentalData, varKey);
		}
		return [];
	}, [zoneAverages, environmentalData, activeVariableId]);

	const heatmapColorMap = useMemo(() => {
		if (effectiveZoneAverages.length === 0) return new Map<number, string>();

		const values = effectiveZoneAverages.map((z) => z.average);
		const minVal = Math.min(...values);
		const maxVal = Math.max(...values);
		const range = maxVal - minVal;

		const colorMap = new Map<number, string>();
		for (const { zoneId: id, average } of effectiveZoneAverages) {
			const normalized = range > 0 ? (average - minVal) / range : 0.5;
			colorMap.set(id, getHeatmapColor(normalized));
		}
		return colorMap;
	}, [effectiveZoneAverages]);

	// -----------------------------------------------------------
	// Add/update layers on the map when geojson or colors change
	// -----------------------------------------------------------
	const updateMapLayers = useCallback(() => {
		const map = mapRef.current;
		if (!map || !mapReady) return;
		// Double-check style is loaded before manipulating layers
		if (!map.isStyleLoaded()) return;

		// --- Bogor boundary layer (always behind zone layers) ---
		if (bogorLayerAddedRef.current) {
			if (map.getLayer(BOGOR_BOUNDARY_LINE_LAYER_ID)) map.removeLayer(BOGOR_BOUNDARY_LINE_LAYER_ID);
			if (map.getLayer(BOGOR_BOUNDARY_FILL_LAYER_ID)) map.removeLayer(BOGOR_BOUNDARY_FILL_LAYER_ID);
			if (map.getSource(BOGOR_BOUNDARY_SOURCE_ID)) map.removeSource(BOGOR_BOUNDARY_SOURCE_ID);
			bogorLayerAddedRef.current = false;
		}

		if (bogorBoundary && levelId !== null) {
			map.addSource(BOGOR_BOUNDARY_SOURCE_ID, {
				type: "geojson",
				data: bogorBoundary,
			});

			map.addLayer({
				id: BOGOR_BOUNDARY_FILL_LAYER_ID,
				type: "fill",
				source: BOGOR_BOUNDARY_SOURCE_ID,
				paint: {
					"fill-color": "rgba(79, 184, 178, 0.04)",
					"fill-opacity": 1,
				},
			});

			map.addLayer({
				id: BOGOR_BOUNDARY_LINE_LAYER_ID,
				type: "line",
				source: BOGOR_BOUNDARY_SOURCE_ID,
				paint: {
					"line-color": "rgba(79, 184, 178, 0.6)",
					"line-width": 2,
					"line-dasharray": [4, 3],
				},
			});

			bogorLayerAddedRef.current = true;
		}

		// --- Remove raster overlay (will be re-added after zone layers) ---
		if (rasterLayerAddedRef.current) {
			if (map.getLayer(RASTER_LAYER_ID)) map.removeLayer(RASTER_LAYER_ID);
			if (map.getSource(RASTER_SOURCE_ID)) map.removeSource(RASTER_SOURCE_ID);
			rasterLayerAddedRef.current = false;
		}

		// --- Zone layers ---
		// Remove existing layers/source
		if (layersAddedRef.current) {
			if (map.getLayer(ZONE_HEATMAP_FILL_LAYER_ID)) map.removeLayer(ZONE_HEATMAP_FILL_LAYER_ID);
			if (map.getLayer(ZONE_FILL_LAYER_ID)) map.removeLayer(ZONE_FILL_LAYER_ID);
			if (map.getLayer(ZONE_LINE_LAYER_ID)) map.removeLayer(ZONE_LINE_LAYER_ID);
			if (map.getSource(ZONES_SOURCE_ID)) map.removeSource(ZONES_SOURCE_ID);
			layersAddedRef.current = false;
		}

		if (!geojson) return;

		map.addSource(ZONES_SOURCE_ID, {
			type: "geojson",
			data: geojson,
		});

		// Heatmap fill layer if we have color data
		if (heatmapColorMap.size > 0) {
			const matchExpr: unknown[] = ["match", ["get", "zone_id"]];
			for (const [id, color] of heatmapColorMap) {
				matchExpr.push(id, color);
			}
			matchExpr.push("rgba(79, 184, 178, 0.15)");

			map.addLayer({
				id: ZONE_HEATMAP_FILL_LAYER_ID,
				type: "fill",
				source: ZONES_SOURCE_ID,
				paint: {
					"fill-color": matchExpr as unknown as MapLibreGL.ExpressionSpecification,
					"fill-opacity": 0.8,
				},
			});
		}

		// Selection fill layer
		map.addLayer({
			id: ZONE_FILL_LAYER_ID,
			type: "fill",
			source: ZONES_SOURCE_ID,
			paint: {
				"fill-color": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					"rgba(79, 184, 178, 0.45)",
					"rgba(79, 184, 178, 0.15)",
				] as unknown as MapLibreGL.ExpressionSpecification,
				"fill-opacity": heatmapColorMap.size > 0
					? ([
						"case",
						["==", ["get", "zone_id"], zoneId ?? -1],
						1,
						0,
					] as unknown as MapLibreGL.ExpressionSpecification)
					: 1,
			},
		});

		// Line layer
		map.addLayer({
			id: ZONE_LINE_LAYER_ID,
			type: "line",
			source: ZONES_SOURCE_ID,
			paint: {
				"line-color": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					"rgba(50, 143, 151, 1)",
					"rgba(50, 143, 151, 0.4)",
				] as unknown as MapLibreGL.ExpressionSpecification,
				"line-width": [
					"case",
					["==", ["get", "zone_id"], zoneId ?? -1],
					3,
					1,
				] as unknown as MapLibreGL.ExpressionSpecification,
			},
		});

		layersAddedRef.current = true;

		// --- Re-add raster overlay below zone heatmap layer ---
		if (rasterImageUrl && rasterBounds) {
			const [west, south, east, north] = rasterBounds;

			map.addSource(RASTER_SOURCE_ID, {
				type: "image",
				url: rasterImageUrl,
				coordinates: [
					[west, north],   // top-left
					[east, north],   // top-right
					[east, south],   // bottom-right
					[west, south],   // bottom-left
				],
			});

			// Insert raster below zone heatmap fill (or below zone fill if no heatmap)
			const beforeLayer = map.getLayer(ZONE_HEATMAP_FILL_LAYER_ID)
				? ZONE_HEATMAP_FILL_LAYER_ID
				: ZONE_FILL_LAYER_ID;

			map.addLayer(
				{
					id: RASTER_LAYER_ID,
					type: "raster",
					source: RASTER_SOURCE_ID,
					paint: {
						"raster-opacity": 0.75,
						"raster-fade-duration": 300,
					},
				},
				beforeLayer,
			);

			rasterLayerAddedRef.current = true;
		}
	}, [geojson, heatmapColorMap, zoneId, mapReady, bogorBoundary, levelId, rasterImageUrl, rasterBounds]);

	// -----------------------------------------------------------
	// Map event handlers setup
	// -----------------------------------------------------------
	const handleMapRef = useCallback((map: MapLibreGL.Map | null) => {
		if (!map) return;
		mapRef.current = map;

		// Poll until style is loaded — the Map component has an internal 100ms delay
		// after styledata before it considers the style ready
		const mapInstance = map;
		function checkStyleReady() {
			if (mapInstance.isStyleLoaded()) {
				setMapReady(true);
			} else {
				setTimeout(checkStyleReady, 150);
			}
		}
		checkStyleReady();

		// Zone click handler
		map.on("click", ZONE_FILL_LAYER_ID, (e) => {
			const feature = e.features?.[0];
			if (feature?.properties?.zone_id != null) {
				setZone(Number(feature.properties.zone_id));
			}
		});

		// Click outside zone clears selection
		map.on("click", (e) => {
			const features = map.queryRenderedFeatures(e.point, {
				layers: [ZONE_FILL_LAYER_ID, ZONE_HEATMAP_FILL_LAYER_ID].filter(
					(id) => map.getLayer(id) != null,
				),
			});
			if (!features || features.length === 0) {
				setZone(null);
			}
		});

		// Hover feedback
		map.on("mouseenter", ZONE_FILL_LAYER_ID, () => {
			map.getCanvas().style.cursor = "pointer";
		});
		map.on("mouseleave", ZONE_FILL_LAYER_ID, () => {
			map.getCanvas().style.cursor = "";
		});
	}, [setZone]);

	// Update layers when data changes
	useEffect(() => {
		updateMapLayers();
	}, [updateMapLayers]);

	// -----------------------------------------------------------
	// Render
	// -----------------------------------------------------------

	return (
		<div
			className="relative h-full w-full overflow-hidden"
			aria-label="Map Panel"
		>
			<MapComponent
				ref={(ref) => handleMapRef(ref as unknown as MapLibreGL.Map | null)}
				center={INITIAL_CENTER}
				zoom={INITIAL_ZOOM}
			>
				<MapControls position="bottom-right" showZoom showCompass />
			</MapComponent>

			{/* Empty state: no level selected */}
			{levelId === null && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<Card size="sm" className="pointer-events-auto bg-card/90 backdrop-blur-sm">
						<CardContent className="pt-3">
							<p className="text-sm text-muted-foreground">
								Select a level to view zones on the map
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Error state */}
			{loadError && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<Card size="sm" className="pointer-events-auto border-destructive/50 bg-card/90 backdrop-blur-sm">
						<CardContent className="pt-3">
							<p className="text-sm text-destructive">
								{loadError}
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Raster unavailable fallback message */}
			{rasterUnavailable && levelId !== null && (
				<div className="pointer-events-none absolute bottom-4 left-4 z-10">
					<Card size="sm" className="bg-card/90 shadow-sm backdrop-blur-sm">
						<CardContent className="pt-3">
							<p
								className="text-xs text-muted-foreground"
								role="status"
								aria-live="polite"
							>
								No satellite image available for the selected date
							</p>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}

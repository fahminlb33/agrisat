import ky from "ky";
import dayjs from "dayjs";
import { z } from "zod";

import {
	EnvironmentalTimeSeriesSchema,
	WeatherTimeSeriesSchema,
	ZoneAnalysisSchema,
	ComparisonResultSchema,
} from "#/schemas/api";

import type {
	EnvironmentalTimePoint,
	WeatherTimePoint,
	ZoneAnalysis,
	ComparisonResult,
} from "#/types/api";

// -----------------------------------------------------------
// HTTP Client
// -----------------------------------------------------------

/**
 * Configured HTTP client with:
 * - Retry: 3 attempts, exponential backoff starting at 1s, jitter up to 500ms, max 10s
 * - Basic auth from environment variables
 *
 * Requirements: 10.3 (retry with exponential backoff)
 */
export const httpClient = ky.create({
	prefix: import.meta.env.VITE_API_HOST,
	retry: {
		limit: 3,
		delay: (attemptCount) => {
			// Exponential backoff starting at 1s, capped at 10s
			return Math.min(1000 * 2 ** (attemptCount - 1), 10000);
		},
		// Jitter up to 500ms added on top of the computed delay
		jitter: (delay) => delay + Math.random() * 500,
	},
	hooks: {
		beforeRequest: [
			({ request }) => {
				const username = import.meta.env.VITE_API_USERNAME;
				const password = import.meta.env.VITE_API_PASSWORD;
				const credential = btoa(`${username}:${password}`);
				request.headers.set("Authorization", `Basic ${credential}`);
			},
		],
	},
});

// -----------------------------------------------------------
// Layers
// -----------------------------------------------------------

export const ListLevelsSchema = z.array(
	z.object({
		level_id: z.number(),
		level: z.string(),
	}),
);

export type Level = z.infer<typeof ListLevelsSchema>[number];

export async function listLevels(): Promise<Level[]> {
	const res = await httpClient.get("layers/levels").json();
	return ListLevelsSchema.parse(res);
}

export const ListZonesSchema = z.array(
	z.object({
		zone_id: z.number(),
		level_id: z.number(),
		level: z.string(),
		name: z.string(),
		city: z.string(),
		area: z.number(),
	}),
);

export type Zone = z.infer<typeof ListZonesSchema>[number];

export async function listZones(params?: {
	levelId?: number;
}): Promise<Zone[]> {
	const searchParams: Record<string, string | number> = {};
	if (params?.levelId != null) {
		searchParams.level_id = params.levelId;
	}
	const res = await httpClient
		.get("layers/zones", { searchParams })
		.json();
	return ListZonesSchema.parse(res);
}

export const ListVariablesSchema = z.array(
	z.object({
		variable_id: z.number(),
		type: z.string(),
		category: z.string(),
		key: z.string(),
		name: z.string(),
		description: z.string(),
	}),
);

export type Variable = z.infer<typeof ListVariablesSchema>[number];

export async function listVariables(): Promise<Variable[]> {
	const res = await httpClient.get("layers/variables").json();
	return ListVariablesSchema.parse(res);
}

export function getPolygonUrl({ levelId }: { levelId: number }): string {
	return `${import.meta.env.VITE_API_HOST}/layers/polygons?level_id=${levelId}`;
}

export function getRasterUrl({
	variableId,
	ts,
}: {
	variableId: number;
	ts: Date;
}): string {
	const tsFormat = dayjs(ts).format("YYYY-MM-DD");
	return `${import.meta.env.VITE_API_HOST}/layers/rasters?variable_id=${variableId}&ts=${tsFormat}`;
}

// -----------------------------------------------------------
// GeoJSON
// -----------------------------------------------------------

export const ZoneGeoJsonSchema = z.object({
	type: z.literal("FeatureCollection"),
	features: z.array(z.any()),
});

export async function getZoneGeoJson(params: {
	zoneId: number;
}): Promise<z.infer<typeof ZoneGeoJsonSchema>> {
	const res = await httpClient
		.get(`layers/zones/${params.zoneId}/geojson`)
		.json();
	return ZoneGeoJsonSchema.parse(res);
}

// -----------------------------------------------------------
// Environmental
// -----------------------------------------------------------

export async function getEnvironmentalTimeSeries(params: {
	levelId?: number;
	zoneId?: number;
	startTs: Date;
	endTs: Date;
}): Promise<EnvironmentalTimePoint[]> {
	const searchParams: Record<string, string | number> = {
		start_ts: dayjs(params.startTs).format("YYYY-MM-DD"),
		end_ts: dayjs(params.endTs).format("YYYY-MM-DD"),
	};
	if (params.levelId != null) searchParams.level_id = params.levelId;
	if (params.zoneId != null) searchParams.zone_id = params.zoneId;

	const res = await httpClient
		.get("environmental/", { searchParams })
		.json();
	return EnvironmentalTimeSeriesSchema.parse(res);
}

// -----------------------------------------------------------
// Weather
// -----------------------------------------------------------

export async function getWeatherTimeSeries(params: {
	levelId?: number;
	zoneId?: number;
	startTs: Date;
	endTs: Date;
}): Promise<WeatherTimePoint[]> {
	const searchParams: Record<string, string | number> = {
		start_ts: dayjs(params.startTs).format("YYYY-MM-DD"),
		end_ts: dayjs(params.endTs).format("YYYY-MM-DD"),
	};
	if (params.levelId != null) searchParams.level_id = params.levelId;
	if (params.zoneId != null) searchParams.zone_id = params.zoneId;

	const res = await httpClient
		.get("weather/", { searchParams })
		.json();
	return WeatherTimeSeriesSchema.parse(res);
}

// -----------------------------------------------------------
// Satellite
// -----------------------------------------------------------

export const SatelliteRasterSchema = z.object({
	url: z.string(),
	bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export async function getSatelliteRaster(params: {
	zoneId: number;
	variableId?: number;
	ts?: Date;
}): Promise<z.infer<typeof SatelliteRasterSchema>> {
	const searchParams: Record<string, string | number> = {};
	if (params.variableId != null) searchParams.variable_id = params.variableId;
	if (params.ts != null) searchParams.ts = dayjs(params.ts).format("YYYY-MM-DD");

	const res = await httpClient
		.get(`satellite/raster/${params.zoneId}`, { searchParams })
		.json();
	return SatelliteRasterSchema.parse(res);
}

// -----------------------------------------------------------
// Insights
// -----------------------------------------------------------

export async function getZoneAnalysis(params: {
	zoneId: number;
	startTs: Date;
	endTs: Date;
	variableKeys?: string[];
}): Promise<ZoneAnalysis> {
	const searchParams: Record<string, string | number> = {
		start_ts: dayjs(params.startTs).format("YYYY-MM-DD"),
		end_ts: dayjs(params.endTs).format("YYYY-MM-DD"),
	};
	if (params.variableKeys?.length) {
		searchParams.variable_keys = params.variableKeys.join(",");
	}

	const res = await httpClient
		.get(`insights/analysis/${params.zoneId}`, { searchParams })
		.json();
	return ZoneAnalysisSchema.parse(res);
}

// -----------------------------------------------------------
// Comparison
// -----------------------------------------------------------

export async function compareZones(params: {
	zoneA: number;
	zoneB: number;
	startTs: Date;
	endTs: Date;
	variableKeys?: string[];
}): Promise<ComparisonResult> {
	const searchParams: Record<string, string | number> = {
		zone_a: params.zoneA,
		zone_b: params.zoneB,
		start_ts: dayjs(params.startTs).format("YYYY-MM-DD"),
		end_ts: dayjs(params.endTs).format("YYYY-MM-DD"),
	};
	if (params.variableKeys?.length) {
		searchParams.variable_keys = params.variableKeys.join(",");
	}

	const res = await httpClient
		.get("insights/compare/zones", { searchParams })
		.json();
	return ComparisonResultSchema.parse(res);
}

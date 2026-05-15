import ky from "ky";
import dayjs from "dayjs";
import { z } from "zod";

export const httpClient = ky.create({
	prefix: import.meta.env.VITE_API_HOST,
	retry: {
		limit: 3,
		jitter: true,
		backoffLimit: 3000,
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

export async function listLevels(): Promise<z.infer<typeof ListLevelsSchema>> {
	const res = await httpClient.get("/layers/levels").json();
	return ListLevelsSchema.parse(res);
}

export const LevelEnum = z.enum(["extent", "kecamatan", "kota", "sawah"]);

export const ListZonesSchema = z.array(
	z.object({
		zone_id: z.number(),
		level_id: z.number(),
		level: LevelEnum,
		name: z.string(),
		city: z.string(),
		area: z.number(),
	}),
);

export async function listZones({
	levelId,
}: {
	levelId?: number;
}): Promise<z.infer<typeof ListZonesSchema>> {
	const res = await httpClient
		.get("/layers/zones", { searchParams: { level_id: levelId } })
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

export async function listVariables(): Promise<
	z.infer<typeof ListVariablesSchema>
> {
	const res = await httpClient.get("/layers/variables").json();
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
	return `${import.meta.env.VITE_API_HOST}/layers/rasters?level_id=${variableId}&ts=${tsFormat}`;
}

// -----------------------------------------------------------
// Satellite
// -----------------------------------------------------------

export const ListSatelliteSchema = z.array(
	z.object({
		id: z.string(),
		tle: z.string(),
	}),
);

export async function listSatelliteOrbits(): Promise<
	z.infer<typeof ListSatelliteSchema>
> {
	const res = await httpClient.get("/satellite").json();
	return ListSatelliteSchema.parse(res);
}

// -----------------------------------------------------------
// Weather
// -----------------------------------------------------------

export const ListWeatherIndicesSchema = z.array(z.string());

export async function listWeatherIndices(): Promise<
	z.infer<typeof ListWeatherIndicesSchema>
> {
	const res = await httpClient.get("/weather/indices").json();
	return ListWeatherIndicesSchema.parse(res);
}

export const GetWeatherTimeSeriesSchema = z.object({
	timestamp: z.coerce.date(),
	zone_id: z.number(),
	zone_name: z.string(),
	zone_city: z.string(),
	level_id: z.number(),
	level: LevelEnum,
	temperature: z.number(),
	precipitation: z.number(),
	cloud_cover_pct: z.number(),
	is_raining: z.boolean(),
});

export async function getWeatherTimeSeries({
	levelId,
	zoneId,
	startTs,
	endTs,
}: {
	levelId?: number;
	zoneId?: number;
	startTs: Date;
	endTs: Date;
}): Promise<z.infer<typeof GetWeatherTimeSeriesSchema>> {
	const res = await httpClient
		.get("/weather/", {
			searchParams: {
				level_id: levelId,
				zone_id: zoneId,
				start_ts: dayjs(startTs).format("YYYY-MM-DD"),
				end_ts: dayjs(endTs).format("YYYY-MM-DD"),
			},
		})
		.json();

	return GetWeatherTimeSeriesSchema.parse(res);
}

// -----------------------------------------------------------
// Environmental
// -----------------------------------------------------------

export const ListEnvironmentalIndicesSchema = z.array(z.string());

export async function listEnvironmentalIndices(): Promise<
	z.infer<typeof ListEnvironmentalIndicesSchema>
> {
	const res = await httpClient.get("/environmental/indices").json();
	return ListEnvironmentalIndicesSchema.parse(res);
}

export const GetEnvironmentTimeSeriesSchema = z.object({
	timestamp: z.coerce.date(),
	zone_id: z.number(),
	zone_name: z.string(),
	zone_city: z.string(),
	level_id: z.number(),
	level: z.string(),
	ndvi: z.number(),
	gndvi: z.number(),
	wdrvi: z.number(),
	msavi: z.number(),
	ndre: z.number(),
	cire: z.number(),
	ndmi: z.number(),
	ndwi: z.number(),
});

export async function getEnvironmentalTimeSeries({
	levelId,
	zoneId,
	startTs,
	endTs,
}: {
	levelId?: number;
	zoneId?: number;
	startTs: Date;
	endTs: Date;
}): Promise<z.infer<typeof GetEnvironmentTimeSeriesSchema>> {
	const res = await httpClient
		.get("/environmental/", {
			searchParams: {
				level_id: levelId,
				zone_id: zoneId,
				start_ts: dayjs(startTs).format("YYYY-MM-DD"),
				end_ts: dayjs(endTs).format("YYYY-MM-DD"),
			},
		})
		.json();

	return GetEnvironmentTimeSeriesSchema.parse(res);
}

/**
 * Zod validation schemas for AgriSat API responses.
 *
 * These schemas validate data at the frontend boundary (Requirement 11.5)
 * and ensure type safety when processing backend responses.
 * Validation constraints enforce domain rules (Requirement 11.2):
 * - Environmental index values must be in [-1, 1]
 * - Precipitation must be >= 0
 * - Cloud cover percentage must be in [0, 100]
 */

import { z } from "zod";

// -----------------------------------------------------------
// Enums
// -----------------------------------------------------------

export const TrendDirectionSchema = z.enum([
  "increasing",
  "decreasing",
  "stable",
]);

export const InsightTypeSchema = z.enum([
  "trend",
  "anomaly",
  "comparison",
  "data_gap",
]);

export const InsightSeveritySchema = z.enum(["info", "warning", "critical"]);

// -----------------------------------------------------------
// Environmental
// -----------------------------------------------------------

/** Vegetation/environmental index value constrained to [-1, 1] */
const indexValue = z.number().min(-1).max(1);

export const EnvironmentalTimePointSchema = z.object({
  timestamp: z.string(),
  zone_id: z.number().int(),
  zone_name: z.string(),
  zone_city: z.string(),
  level_id: z.number().int(),
  level: z.string(),
  ndvi: indexValue,
  gndvi: indexValue,
  wdrvi: indexValue,
  msavi: indexValue,
  ndre: indexValue,
  cire: indexValue,
  ndmi: indexValue,
  ndwi: indexValue,
});

export const EnvironmentalTimeSeriesSchema = z.array(
  EnvironmentalTimePointSchema,
);

// -----------------------------------------------------------
// Weather
// -----------------------------------------------------------

export const WeatherTimePointSchema = z.object({
  timestamp: z.string(),
  zone_id: z.number().int(),
  zone_name: z.string(),
  zone_city: z.string(),
  level_id: z.number().int(),
  level: z.string(),
  temperature: z.number(),
  precipitation: z.number().min(0),
  cloud_cover_pct: z.number().min(0).max(100),
  is_raining: z.boolean(),
});

export const WeatherTimeSeriesSchema = z.array(WeatherTimePointSchema);

// -----------------------------------------------------------
// Zone Analysis
// -----------------------------------------------------------

export const VariableMetricResultSchema = z.object({
  variable_key: z.string(),
  current: z.number(),
  average: z.number(),
  min_val: z.number(),
  max_val: z.number(),
  trend: TrendDirectionSchema,
  trend_magnitude: z.number(),
});

export const ZoneInsightSchema = z.object({
  type: InsightTypeSchema,
  severity: InsightSeveritySchema,
  title: z.string(),
  description: z.string(),
  variable_key: z.string().nullable(),
  zone_id: z.number().int().nullable(),
});

export const ZoneAnalysisSchema = z.object({
  zone_id: z.number().int(),
  zone_name: z.string(),
  metrics: z.array(VariableMetricResultSchema),
  insights: z.array(ZoneInsightSchema),
});

// -----------------------------------------------------------
// Insights
// -----------------------------------------------------------

export const InsightResultSchema = z.object({
  zone_id: z.number().int(),
  zone_name: z.string(),
  variable_key: z.string(),
  current_value: z.number(),
  average_value: z.number(),
  min_value: z.number(),
  max_value: z.number(),
  trend: TrendDirectionSchema,
  trend_magnitude: z.number(),
  anomaly_detected: z.boolean(),
  anomaly_zscore: z.number().nullable(),
  insight_message: z.string(),
});

export const InsightResultListSchema = z.array(InsightResultSchema);

// -----------------------------------------------------------
// Comparison
// -----------------------------------------------------------

export const ComparisonDeltaSchema = z.object({
  variable_key: z.string(),
  value_a: z.number(),
  value_b: z.number(),
  absolute_diff: z.number(),
  relative_diff_pct: z.number(),
  interpretation: z.string(),
});

export const ComparisonResultSchema = z.object({
  type: z.string(),
  target_a: z.record(z.string(), z.unknown()),
  target_b: z.record(z.string(), z.unknown()),
  metrics_a: z.array(VariableMetricResultSchema),
  metrics_b: z.array(VariableMetricResultSchema),
  deltas: z.array(ComparisonDeltaSchema),
});

/**
 * Shared TypeScript types for AgriSat API responses.
 *
 * These interfaces mirror the backend Pydantic models and are used
 * throughout the frontend for type-safe data handling.
 */

// -----------------------------------------------------------
// Enums
// -----------------------------------------------------------

export type TrendDirection = "increasing" | "decreasing" | "stable";

export type InsightType = "trend" | "anomaly" | "comparison" | "data_gap";

export type InsightSeverity = "info" | "warning" | "critical";

// -----------------------------------------------------------
// Environmental
// -----------------------------------------------------------

export interface EnvironmentalTimePoint {
  timestamp: string;
  zone_id: number;
  zone_name: string;
  zone_city: string;
  level_id: number;
  level: string;
  ndvi: number;
  gndvi: number;
  wdrvi: number;
  msavi: number;
  ndre: number;
  cire: number;
  ndmi: number;
  ndwi: number;
}

// -----------------------------------------------------------
// Weather
// -----------------------------------------------------------

export interface WeatherTimePoint {
  timestamp: string;
  zone_id: number;
  zone_name: string;
  zone_city: string;
  level_id: number;
  level: string;
  temperature: number;
  precipitation: number;
  cloud_cover_pct: number;
  is_raining: boolean;
}

// -----------------------------------------------------------
// Zone Analysis
// -----------------------------------------------------------

export interface VariableMetricResult {
  variable_key: string;
  current: number;
  average: number;
  min_val: number;
  max_val: number;
  trend: TrendDirection;
  trend_magnitude: number;
}

export interface ZoneInsight {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  variable_key: string | null;
  zone_id: number | null;
}

export interface ZoneAnalysis {
  zone_id: number;
  zone_name: string;
  metrics: VariableMetricResult[];
  insights: ZoneInsight[];
}

// -----------------------------------------------------------
// Insights
// -----------------------------------------------------------

export interface InsightResult {
  zone_id: number;
  zone_name: string;
  variable_key: string;
  current_value: number;
  average_value: number;
  min_value: number;
  max_value: number;
  trend: TrendDirection;
  trend_magnitude: number;
  anomaly_detected: boolean;
  anomaly_zscore: number | null;
  insight_message: string;
}

// -----------------------------------------------------------
// Comparison
// -----------------------------------------------------------

export interface ComparisonDelta {
  variable_key: string;
  value_a: number;
  value_b: number;
  absolute_diff: number;
  relative_diff_pct: number;
  interpretation: string;
}

export interface ComparisonResult {
  type: string;
  target_a: Record<string, unknown>;
  target_b: Record<string, unknown>;
  metrics_a: VariableMetricResult[];
  metrics_b: VariableMetricResult[];
  deltas: ComparisonDelta[];
}

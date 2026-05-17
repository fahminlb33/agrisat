import { describe, expect, it } from "vitest";
import {
  EnvironmentalTimePointSchema,
  WeatherTimePointSchema,
  ZoneAnalysisSchema,
  InsightResultSchema,
  ComparisonResultSchema,
} from "./api";

describe("EnvironmentalTimePointSchema", () => {
  const validPoint = {
    timestamp: "2024-06-15",
    zone_id: 1,
    zone_name: "Field A",
    zone_city: "Springfield",
    level_id: 2,
    level: "field",
    ndvi: 0.72,
    gndvi: 0.65,
    wdrvi: 0.3,
    msavi: 0.55,
    ndre: 0.4,
    cire: 0.35,
    ndmi: 0.1,
    ndwi: -0.2,
  };

  it("accepts valid environmental data", () => {
    const result = EnvironmentalTimePointSchema.safeParse(validPoint);
    expect(result.success).toBe(true);
  });

  it("accepts boundary index values at -1 and 1", () => {
    const atBounds = { ...validPoint, ndvi: -1, gndvi: 1 };
    const result = EnvironmentalTimePointSchema.safeParse(atBounds);
    expect(result.success).toBe(true);
  });

  it("rejects index values above 1", () => {
    const invalid = { ...validPoint, ndvi: 1.01 };
    const result = EnvironmentalTimePointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects index values below -1", () => {
    const invalid = { ...validPoint, ndmi: -1.5 };
    const result = EnvironmentalTimePointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("WeatherTimePointSchema", () => {
  const validWeather = {
    timestamp: "2024-06-15",
    zone_id: 1,
    zone_name: "Field A",
    zone_city: "Springfield",
    level_id: 2,
    level: "field",
    temperature: 28.5,
    precipitation: 12.3,
    cloud_cover_pct: 45,
    is_raining: false,
  };

  it("accepts valid weather data", () => {
    const result = WeatherTimePointSchema.safeParse(validWeather);
    expect(result.success).toBe(true);
  });

  it("accepts zero precipitation and cloud cover", () => {
    const atZero = { ...validWeather, precipitation: 0, cloud_cover_pct: 0 };
    const result = WeatherTimePointSchema.safeParse(atZero);
    expect(result.success).toBe(true);
  });

  it("accepts 100% cloud cover", () => {
    const full = { ...validWeather, cloud_cover_pct: 100 };
    const result = WeatherTimePointSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects negative precipitation", () => {
    const invalid = { ...validWeather, precipitation: -1 };
    const result = WeatherTimePointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects cloud cover above 100", () => {
    const invalid = { ...validWeather, cloud_cover_pct: 101 };
    const result = WeatherTimePointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative cloud cover", () => {
    const invalid = { ...validWeather, cloud_cover_pct: -5 };
    const result = WeatherTimePointSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ZoneAnalysisSchema", () => {
  it("accepts valid zone analysis", () => {
    const valid = {
      zone_id: 1,
      zone_name: "Field A",
      metrics: [
        {
          variable_key: "ndvi",
          current: 0.7,
          average: 0.65,
          min_val: 0.5,
          max_val: 0.8,
          trend: "increasing",
          trend_magnitude: 0.002,
        },
      ],
      insights: [
        {
          type: "trend",
          severity: "info",
          title: "NDVI is increasing",
          description: "Field A: NDVI shows an increasing trend.",
          variable_key: "ndvi",
          zone_id: 1,
        },
      ],
    };
    const result = ZoneAnalysisSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("InsightResultSchema", () => {
  it("accepts valid insight result", () => {
    const valid = {
      zone_id: 1,
      zone_name: "Field A",
      variable_key: "ndvi",
      current_value: 0.72,
      average_value: 0.65,
      min_value: 0.5,
      max_value: 0.8,
      trend: "increasing",
      trend_magnitude: 0.003,
      anomaly_detected: false,
      anomaly_zscore: null,
      insight_message: "NDVI is trending upward.",
    };
    const result = InsightResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts insight with anomaly z-score", () => {
    const valid = {
      zone_id: 2,
      zone_name: "Field B",
      variable_key: "ndmi",
      current_value: -0.3,
      average_value: 0.1,
      min_value: -0.3,
      max_value: 0.4,
      trend: "decreasing",
      trend_magnitude: -0.005,
      anomaly_detected: true,
      anomaly_zscore: -2.5,
      insight_message: "Abnormal drop in NDMI detected.",
    };
    const result = InsightResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("ComparisonResultSchema", () => {
  it("accepts valid comparison result", () => {
    const valid = {
      type: "zone",
      target_a: { zone_id: 1 },
      target_b: { zone_id: 2 },
      metrics_a: [
        {
          variable_key: "ndvi",
          current: 0.7,
          average: 0.65,
          min_val: 0.5,
          max_val: 0.8,
          trend: "increasing",
          trend_magnitude: 0.002,
        },
      ],
      metrics_b: [
        {
          variable_key: "ndvi",
          current: 0.6,
          average: 0.55,
          min_val: 0.4,
          max_val: 0.7,
          trend: "stable",
          trend_magnitude: 0.0005,
        },
      ],
      deltas: [
        {
          variable_key: "ndvi",
          value_a: 0.65,
          value_b: 0.55,
          absolute_diff: 0.1,
          relative_diff_pct: 18.18,
          interpretation: "Zone A is 18.2% higher than Zone B",
        },
      ],
    };
    const result = ComparisonResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

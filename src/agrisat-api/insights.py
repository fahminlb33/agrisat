"""
Insights Engine module for AgriSat MVP.

Provides trend detection, anomaly detection, and insight generation
from environmental and weather time series data.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from .repository.environmental import Statistics
from .repository.weather import Weather


# ------------------------------------------------------
# Enums
# ------------------------------------------------------


class TrendDirection(str, Enum):
    increasing = "increasing"
    decreasing = "decreasing"
    stable = "stable"


class InsightType(str, Enum):
    trend = "trend"
    anomaly = "anomaly"
    comparison = "comparison"
    data_gap = "data_gap"


class InsightSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


# ------------------------------------------------------
# Pydantic Models
# ------------------------------------------------------


class ZoneInsight(BaseModel):
    type: InsightType
    severity: InsightSeverity
    title: str
    description: str
    variable_key: str | None = None
    zone_id: int | None = None


class VariableMetricResult(BaseModel):
    variable_key: str
    current: float
    average: float
    min_val: float
    max_val: float
    trend: TrendDirection
    trend_magnitude: float


class ZoneAnalysis(BaseModel):
    zone_id: int
    zone_name: str
    metrics: list[VariableMetricResult]
    insights: list[ZoneInsight]


class ComparisonDelta(BaseModel):
    variable_key: str
    value_a: float
    value_b: float
    absolute_diff: float
    relative_diff_pct: float
    interpretation: str


class ComparisonResult(BaseModel):
    type: str  # "zone", "time", "variable"
    target_a: dict
    target_b: dict
    metrics_a: list[VariableMetricResult]
    metrics_b: list[VariableMetricResult]
    deltas: list[ComparisonDelta]


# ------------------------------------------------------
# Helper Functions
# ------------------------------------------------------


def _parse_date(timestamp_str: str) -> datetime:
    """Parse an ISO 8601 date string into a datetime object."""
    # Handle both date-only and datetime formats
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(timestamp_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unable to parse timestamp: {timestamp_str}")


# ------------------------------------------------------
# Core Algorithms
# ------------------------------------------------------


def compute_trend(
    time_series: list[float],
    timestamps: list[datetime],
    threshold: float = 0.001,
) -> tuple[TrendDirection, float]:
    """
    Compute trend direction and magnitude using linear regression.

    Preconditions:
        - len(time_series) == len(timestamps)
        - len(time_series) >= 2
        - timestamps are sorted ascending

    Postconditions:
        - Returns (direction, magnitude) where magnitude is the slope
        - direction is 'stable' when |magnitude| < threshold
        - direction is 'increasing' when magnitude >= threshold
        - direction is 'decreasing' when magnitude <= -threshold
    """
    n = len(time_series)

    # Convert timestamps to numeric (days from start)
    t0 = timestamps[0]
    x = [(ts - t0).days for ts in timestamps]
    y = time_series

    # Linear regression: y = mx + b
    x_mean = sum(x) / n
    y_mean = sum(y) / n

    numerator = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n))
    denominator = sum((x[i] - x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return (TrendDirection.stable, 0.0)

    slope = numerator / denominator

    if abs(slope) < threshold:
        return (TrendDirection.stable, slope)
    elif slope > 0:
        return (TrendDirection.increasing, slope)
    else:
        return (TrendDirection.decreasing, slope)


def detect_anomalies(
    time_series: list[float],
    window_size: int = 5,
    z_threshold: float = 2.0,
) -> list[tuple[int, float]]:
    """
    Detect anomalies using z-score deviation from rolling mean.

    Preconditions:
        - len(time_series) >= window_size
        - window_size >= 2
        - z_threshold > 0

    Postconditions:
        - Returns list of (index, z_score) for anomalous points
        - A point is anomalous when |z_score| > z_threshold
        - z_score = (value - rolling_mean) / rolling_std
    """
    anomalies = []

    for i in range(window_size, len(time_series)):
        window = time_series[i - window_size : i]

        mean = sum(window) / len(window)
        variance = sum((v - mean) ** 2 for v in window) / len(window)
        std = variance**0.5

        if std == 0:
            continue

        z_score = (time_series[i] - mean) / std

        if abs(z_score) > z_threshold:
            anomalies.append((i, z_score))

    return anomalies


def generate_insights(
    zone_id: int,
    zone_name: str,
    env_series: list[Statistics],
    weather_series: list[Weather],
    variable_keys: list[str],
) -> list[ZoneInsight]:
    """
    Generate human-readable insights from time series data.

    Preconditions:
        - env_series is sorted by timestamp ascending
        - variable_keys contains valid variable key strings

    Postconditions:
        - Returns list of insights ordered by severity (critical first)
        - Each insight has a unique, descriptive message
        - At most one trend insight per variable
        - Anomaly insights reference specific timestamps
    """
    insights: list[ZoneInsight] = []

    # Req 7.8: If fewer than 3 observations, skip trend/anomaly and return empty
    if len(env_series) < 3:
        return []

    for var_key in variable_keys:
        values = [getattr(point, var_key) for point in env_series]
        timestamps = [_parse_date(point.timestamp) for point in env_series]

        # Trend detection (requires >= 3 observations per req 7.1)
        if len(values) >= 3:
            direction, magnitude = compute_trend(values, timestamps)
            if direction != TrendDirection.stable:
                severity = (
                    InsightSeverity.warning
                    if abs(magnitude) > 0.005
                    else InsightSeverity.info
                )
                insights.append(
                    ZoneInsight(
                        type=InsightType.trend,
                        severity=severity,
                        title=f"{var_key.upper()} is {direction.value}",
                        description=(
                            f"{zone_name}: {var_key.upper()} shows a {direction.value} "
                            f"trend (slope: {magnitude:.4f}/day) over the selected period."
                        ),
                        variable_key=var_key,
                        zone_id=zone_id,
                    )
                )

        # Anomaly detection (requires >= 6 observations per req 7.2)
        if len(values) >= 6:
            anomalies = detect_anomalies(values)
            for idx, z_score in anomalies:
                severity = (
                    InsightSeverity.critical
                    if abs(z_score) > 3.0
                    else InsightSeverity.warning
                )
                direction_word = "spike" if z_score > 0 else "drop"
                insights.append(
                    ZoneInsight(
                        type=InsightType.anomaly,
                        severity=severity,
                        title=f"Abnormal {direction_word} in {var_key.upper()}",
                        description=(
                            f"{zone_name}: Detected abnormal {direction_word} in "
                            f"{var_key.upper()} at {timestamps[idx]} "
                            f"(z-score: {z_score:.2f})."
                        ),
                        variable_key=var_key,
                        zone_id=zone_id,
                    )
                )

    # Data gap detection (req 7.5)
    if len(env_series) >= 2:
        for i in range(1, len(env_series)):
            current_ts = _parse_date(env_series[i].timestamp)
            prev_ts = _parse_date(env_series[i - 1].timestamp)
            gap_days = (current_ts - prev_ts).days
            if gap_days > 10:
                insights.append(
                    ZoneInsight(
                        type=InsightType.data_gap,
                        severity=InsightSeverity.info,
                        title="Data gap detected",
                        description=(
                            f"{zone_name}: No satellite data available between "
                            f"{env_series[i - 1].timestamp} and {env_series[i].timestamp} "
                            f"({gap_days} days). Likely due to cloud cover."
                        ),
                        zone_id=zone_id,
                    )
                )

    # Sort by severity: critical > warning > info (req 7.6)
    severity_order = {
        InsightSeverity.critical: 0,
        InsightSeverity.warning: 1,
        InsightSeverity.info: 2,
    }
    insights.sort(key=lambda x: severity_order[x.severity])

    return insights

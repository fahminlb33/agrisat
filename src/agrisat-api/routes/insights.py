from typing import Annotated
from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel, model_validator
from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db, get_current_user
from ..repository.environmental import get_time_series as env_get_time_series
from ..repository.weather import get_time_series as weather_get_time_series
from ..insights import (
    compute_trend,
    generate_insights,
    _parse_date,
    ZoneAnalysis,
    VariableMetricResult,
    ComparisonResult,
    ComparisonDelta,
)

router = APIRouter(
    prefix="/api/insights", tags=["Insights"], dependencies=[Depends(get_current_user)]
)

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------

DEFAULT_VARIABLE_KEYS = ["ndvi", "ndmi"]


class AnalysisQuery(BaseModel):
    start_ts: datetime
    end_ts: datetime
    variable_keys: list[str] = DEFAULT_VARIABLE_KEYS

    @model_validator(mode="after")
    def start_before_end(self) -> "AnalysisQuery":
        if self.start_ts >= self.end_ts:
            raise ValueError("'start_ts' must be before 'end_ts'")
        return self


class CompareZonesQuery(BaseModel):
    zone_a: int
    zone_b: int
    start_ts: datetime
    end_ts: datetime
    variable_keys: list[str] = DEFAULT_VARIABLE_KEYS

    @model_validator(mode="after")
    def start_before_end(self) -> "CompareZonesQuery":
        if self.start_ts >= self.end_ts:
            raise ValueError("'start_ts' must be before 'end_ts'")
        return self


# ------------------------------------------------------
# Helper Functions
# ------------------------------------------------------


def _compute_zone_analysis(
    db: Connection,
    zone_id: int,
    start_ts: datetime,
    end_ts: datetime,
    variable_keys: list[str],
) -> ZoneAnalysis:
    """Compute analysis for a single zone."""
    # Fetch environmental time series for the zone and time range
    env_series = env_get_time_series(db, None, zone_id, start_ts, end_ts)
    # Fetch weather time series
    weather_series = weather_get_time_series(db, None, zone_id, start_ts, end_ts)

    # Compute metrics per variable
    metrics: list[VariableMetricResult] = []
    for var_key in variable_keys:
        values = [getattr(point, var_key) for point in env_series]
        if not values:
            continue

        timestamps = [_parse_date(p.timestamp) for p in env_series]

        # Compute trend (requires >= 2 data points)
        if len(values) >= 2:
            direction, magnitude = compute_trend(values, timestamps)
        else:
            from ..insights import TrendDirection

            direction = TrendDirection.stable
            magnitude = 0.0

        metrics.append(
            VariableMetricResult(
                variable_key=var_key,
                current=values[-1],
                average=sum(values) / len(values),
                min_val=min(values),
                max_val=max(values),
                trend=direction,
                trend_magnitude=magnitude,
            )
        )

    # Generate insights
    zone_name = env_series[0].zone_name if env_series else "Unknown"
    insights = generate_insights(
        zone_id, zone_name, env_series, weather_series, variable_keys
    )

    return ZoneAnalysis(
        zone_id=zone_id,
        zone_name=zone_name,
        metrics=metrics,
        insights=insights,
    )


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/analysis/{zone_id}")
async def api_zone_analysis(
    zone_id: int,
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[AnalysisQuery, Query()],
) -> ZoneAnalysis:
    """
    Get zone analysis with metrics and insights for the specified zone.

    Returns current value, average, min, max, trend direction, and trend magnitude
    for each requested variable, plus generated insights (trends, anomalies, data gaps).
    """
    return _compute_zone_analysis(
        db, zone_id, query.start_ts, query.end_ts, query.variable_keys
    )


@router.get("/compare/zones")
async def api_compare_zones(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[CompareZonesQuery, Query()],
) -> ComparisonResult:
    """
    Compare two zones across the specified variables and time range.

    Returns metrics for both zones, absolute and relative differences,
    and interpretation sentences using actual zone names.
    """
    # Compute analysis for both zones
    analysis_a = _compute_zone_analysis(
        db, query.zone_a, query.start_ts, query.end_ts, query.variable_keys
    )
    analysis_b = _compute_zone_analysis(
        db, query.zone_b, query.start_ts, query.end_ts, query.variable_keys
    )

    # Compute deltas
    deltas: list[ComparisonDelta] = []
    for metric_a, metric_b in zip(analysis_a.metrics, analysis_b.metrics):
        abs_diff = metric_a.average - metric_b.average

        # Division-by-zero handling (Requirement 8.4)
        if metric_b.average != 0:
            rel_diff = (abs_diff / metric_b.average) * 100
        else:
            rel_diff = 0.0

        # Generate interpretation with actual zone names (Requirement 8.5)
        name_a = analysis_a.zone_name
        name_b = analysis_b.zone_name

        if metric_b.average == 0 and abs_diff != 0:
            interpretation = (
                f"{name_a} vs {name_b}: relative difference is not computable "
                f"for {metric_a.variable_key.upper()} (division by zero)"
            )
        elif abs_diff > 0:
            interpretation = (
                f"{name_a} is {abs(rel_diff):.1f}% higher than {name_b} "
                f"for {metric_a.variable_key.upper()}"
            )
        elif abs_diff < 0:
            interpretation = (
                f"{name_a} is {abs(rel_diff):.1f}% lower than {name_b} "
                f"for {metric_a.variable_key.upper()}"
            )
        else:
            interpretation = (
                f"{name_a} and {name_b} have equal values "
                f"for {metric_a.variable_key.upper()}"
            )

        deltas.append(
            ComparisonDelta(
                variable_key=metric_a.variable_key,
                value_a=metric_a.average,
                value_b=metric_b.average,
                absolute_diff=abs_diff,
                relative_diff_pct=rel_diff,
                interpretation=interpretation,
            )
        )

    return ComparisonResult(
        type="zone",
        target_a={"zone_id": query.zone_a, "zone_name": analysis_a.zone_name},
        target_b={"zone_id": query.zone_b, "zone_name": analysis_b.zone_name},
        metrics_a=analysis_a.metrics,
        metrics_b=analysis_b.metrics,
        deltas=deltas,
    )

from typing import Annotated
from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db
from ..repository.layers import (
    list_zones,
    list_wms_layers,
    list_wms_time_range,
    get_environmental_time_series,
    get_weather_time_series,
)

router = APIRouter(prefix="/environmental", tags=["Layers"])

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class TimeSeriesQuery(BaseModel):
    zone_id: int
    start: datetime
    end: datetime


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/indices")
async def api_list_statitics_indices(db: Annotated[Connection, Depends(get_db)]):
    return list_wms_time_range(db)


@router.get("/statistics")
async def api_get_statistics(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[TimeSeriesQuery, Query()],
):
    return get_weather_time_series(db, query.start, query.end, query.zone_id)


@router.get("/statistics")
async def api_get_statistics(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[TimeSeriesQuery, Query()],
):
    return get_weather_time_series(db, query.start, query.end, query.zone_id)


@router.get("/weather/indices")
async def api_list_weather_indices(db: Annotated[Connection, Depends(get_db)]):
    return list_wms_time_range(db)


@router.get("/weather")
async def api_get_weather(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[TimeSeriesQuery, Query()],
):
    return get_weather_time_series(db, query.start, query.end, query.zone_id)

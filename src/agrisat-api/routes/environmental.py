from typing import Annotated
from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db
from ..repository.environmental import (
    list_indices,
    get_time_series,
)

router = APIRouter(prefix="/environmental", tags=["Environmental"])

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class TimeSeriesQuery(BaseModel):
    zone_id: int
    ts: datetime


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/indices")
async def api_list_indices(db: Annotated[Connection, Depends(get_db)]):
    return list_indices(db)


@router.get("/")
async def api_time_series(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[TimeSeriesQuery, Query()],
):
    return get_time_series(db, query.zone_id, query.ts)

from typing import Annotated
from sqlite3 import Connection
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator
from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db
from ..repository.weather import (
    list_indices,
    get_time_series,
)

router = APIRouter(prefix="/weather", tags=["Weather"])

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class TimeSeriesQuery(BaseModel):
    level_id: Optional[int] = None
    zone_id: Optional[int] = None
    start_ts: datetime
    end_ts: datetime

    @model_validator(mode="after")
    def level_or_zone_provided(self) -> "TimeSeriesQuery":
        if self.level_id is None and self.zone_id is None:
            raise ValueError("Either 'level_id' or 'zone_id' must be provided")

        return self


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
    return get_time_series(
        db, query.level_id, query.zone_id, query.start_ts, query.end_ts
    )

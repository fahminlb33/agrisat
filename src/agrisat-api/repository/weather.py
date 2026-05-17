from sqlite3 import Connection, Row
from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, AfterValidator

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------

RoundedFloat = Annotated[float, AfterValidator(lambda v: round(v, 4))]


class Weather(BaseModel):
    timestamp: str
    zone_id: int
    zone_name: str
    zone_city: str
    level_id: int
    level: str

    # Weather data
    temperature: RoundedFloat
    precipitation: RoundedFloat
    cloud_cover_pct: RoundedFloat
    is_raining: bool


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_indices(db: Connection) -> list[str]:
    cursor = db.cursor()
    statement = cursor.execute(
        "SELECT DISTINCT date(timestamp) AS ts FROM zonal_weather"
    )

    return [x[0] for x in statement.fetchall()]


def get_time_series(
    db: Connection,
    level_id: Optional[int],
    zone_id: Optional[int],
    start_ts: datetime,
    end_ts: datetime,
) -> list[Weather]:
    cursor = db.cursor()
    cursor.row_factory = Row

    where_sql = "zl.id = ?"
    if zone_id is not None:
        where_sql = "z.id = ?"

    statement = cursor.execute(
        f"""
        SELECT
            zw.*,
            zw.cloud_cover * 100 AS cloud_cover_pct,
            z.name AS zone_name,
            z.city AS zone_city,
            zl.id AS level_id,
            zl.level AS level
        FROM
            zonal_weather zw
        INNER JOIN
            zones z ON z.id = zw.zone_id
        INNER JOIN
            zone_level zl ON zl.id = z.level_id
        WHERE 
            {where_sql}
            AND date(timestamp) BETWEEN ? AND ?
        """,
        (
            level_id or zone_id,
            start_ts.strftime("%Y-%m-%d"),
            end_ts.strftime("%Y-%m-%d"),
        ),
    )

    return [Weather(**x) for x in statement.fetchall()]

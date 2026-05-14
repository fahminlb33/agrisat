from sqlite3 import Connection, Row
from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, AfterValidator

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------

RoundedFloat = Annotated[float, AfterValidator(lambda v: round(v, 4))]


class Statistics(BaseModel):
    timestamp: str
    zone_id: int
    zone_name: str
    zone_city: str
    level_id: int
    level: str

    # Vegetation Index
    ndvi: RoundedFloat
    gndvi: RoundedFloat
    wdrvi: RoundedFloat
    msavi: RoundedFloat
    # Chlorophyll Index
    ndre: RoundedFloat
    cire: RoundedFloat
    # Water Stress Index
    ndmi: RoundedFloat
    ndwi: RoundedFloat


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_indices(db: Connection) -> list[str]:
    cursor = db.cursor()
    statement = cursor.execute("SELECT DISTINCT date(timestamp) FROM zonal_raster")

    return [x[0] for x in statement.fetchall()]


def get_time_series(
    db: Connection,
    level_id: Optional[int],
    zone_id: Optional[int],
    start_ts: datetime,
    end_ts: datetime,
) -> list[Statistics]:
    cursor = db.cursor()
    cursor.row_factory = Row

    where_sql = "zl.id = ?"
    if zone_id is not None:
        where_sql = "z.id = ?"

    statement = cursor.execute(
        f"""
        SELECT
            zs.*,
            z.name AS zone_name,
            z.city AS zone_city,
            zl.id AS level_id,
            zl.level AS level
        FROM 
            zonal_statistics zs
        INNER JOIN 
            zones z ON z.id = zs.zone_id
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

    return [Statistics(**x) for x in statement.fetchall()]

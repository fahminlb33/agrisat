from sqlite3 import Connection, Row
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class Statistics(BaseModel):
    id: int
    zone_id: int
    timestamp: str

    # Vegetation Index
    ndvi: float
    gndvi: float
    wdrvi: float
    msavi: float
    # Chlorophyll Index
    ndre: float
    cire: float
    # Water Stress Index
    ndmi: float
    ndwi: float


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_indices(db: Connection) -> list[str]:
    cursor = db.cursor()
    statement = cursor.execute("SELECT DISTINCT date(timestamp) FROM zonal_raster")
    rows = statement.fetchall()

    return [x[0] for x in rows]


def get_time_series(db: Connection, zone_id: int, ts: datetime) -> list[Statistics]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute(
        """
        SELECT *
        FROM zonal_statistics 
        WHERE 
            zone_id = ?
            AND timestamp = ?
        """,
        (zone_id, ts.strftime("%Y-%m-%d")),
    )
    rows = statement.fetchall()

    return [Statistics(**x) for x in rows]

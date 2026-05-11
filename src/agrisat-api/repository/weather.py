from sqlite3 import Connection, Row
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class Weather(BaseModel):
    id: int
    timestamp: datetime
    temperature: float
    precipitation: float


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_incices(db: Connection) -> list[str]:
    cursor = db.cursor()
    statement = cursor.execute(
        "SELECT DISTINCT date(timestamp) AS ts FROM zonal_weather"
    )
    rows = statement.fetchall()

    return [x[0] for x in rows]


def get_time_series(db: Connection, zone_id: int, ts_date: datetime) -> list[Weather]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute(
        """
        SELECT *
        FROM zonal_weather
        WHERE 
            zone_id = ?
            AND date(timestamp) = ?
        """,
        (zone_id, ts_date.strftime("%Y-%m-%d")),
    )
    rows = statement.fetchall()

    return [Weather(**x) for x in rows]

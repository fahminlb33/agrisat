from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class Zone(BaseModel):
    zone_id: int
    group: str
    name: str
    area: float


class ZonalStatistics(BaseModel):
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


class Weather(BaseModel):
    id: int
    timestamp: datetime
    temperature: float
    precipitation: float


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_zones(db: Connection) -> list[Zone]:
    cursor = db.cursor()
    items = cursor.execute("SELECT id, group, name, area FROM areas").fetchall()

    return [Zone(id=x[0], group=x[1], name=x[2], area=x[3]) for x in items]


def list_layers(db: Connection) -> list[RasterLayer]:
    cursor = db.cursor()
    statement = cursor.execute(
        "SELECT id, key, name, description, wmts_url FROM variables"
    )
    rows = statement.fetchall()

    return [
        RasterLayer(id=x[0], key=x[1], name=x[2], description=x[3], wmts_url=x[4])
        for x in rows
    ]


def list_raster_time_range(db: Connection) -> list[RasterDate]:
    cursor = db.cursor()
    statement = cursor.execute("SELECT DISTINCT timestamp FROM zonal_raster")
    rows = statement.fetchall()

    return [RasterDate(id=x[0]) for x in rows]


def get_environmental_time_series(
    db: Connection, ts_start: datetime, ts_end: datetime, zone_id: int
) -> list[ZonalStatistics]:
    cursor = db.cursor()
    statement = cursor.execute(
        """
        SELECT
            id,
            timestamp, 
            -- vegetation
            ndvi,
            gndvi,
            wdrvi,
            msavi,
            -- chlorophyll
            ndre,
            cire,
            -- water
            ndmi,
            ndwi
        FROM zonal_statistics 
        WHERE 
            zone_id = ?
            AND timestamp BETWEEN ? AND ?
        """,
        (zone_id, ts_start.strftime("%Y%m%d"), ts_end.strftime("%Y%m%d")),
    )
    rows = statement.fetchall()

    return [
        ZonalStatistics(
            id=x[0],
            timestamp=x[1],
            # Vegetation Index
            ndvi=x[2],
            gndvi=x[3],
            wdrvi=x[4],
            msavi=x[5],
            # Chlorophyll Index
            ndre=x[6],
            cire=x[7],
            # Water Stress Index
            ndmi=x[8],
            ndwi=x[9],
        )
        for x in rows
    ]


def get_weather_time_series(
    db: Connection, ts_start: datetime, ts_end: datetime, zone_id: int
) -> list[Weather]:
    cursor = db.cursor()
    statement = cursor.execute(
        """
        SELECT
            id,
            timestamp, 
            temperature,
            precipitation
        FROM zonal_weather
        WHERE 
            zone_id = ?
            AND timestamp BETWEEN ? AND ?
        """,
        (zone_id, ts_start.strftime("%Y%m%d"), ts_end.strftime("%Y%m%d")),
    )
    rows = statement.fetchall()

    return [
        Weather(id=x[0], timestamp=x[1], temperature=x[2], precipitation=x[3])
        for x in rows
    ]

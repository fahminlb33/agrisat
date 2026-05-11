from sqlite3 import Connection, Row
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class ZoneLevel(BaseModel):
    id: int
    level: str


class Zone(BaseModel):
    id: int
    hash: str
    level: str
    name: str
    city: str
    area: float


class Variable(BaseModel):
    id: int
    type: str
    category: str
    key: str
    name: str
    description: str


class LayerRaster(BaseModel):
    raster_id: int
    variable_id: int
    file_name: str
    data_blob: bytes


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_levels(db: Connection) -> list[ZoneLevel]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT id, level FROM zone_level")
    rows = statement.fetchall()

    return [ZoneLevel(**row) for row in rows]


def list_zones(db: Connection) -> list[Zone]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT * FROM zones")
    rows = statement.fetchall()

    return [Zone(**row) for row in rows]


def list_variables(db: Connection) -> list[Variable]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT * FROM variables")
    rows = statement.fetchall()

    return [Variable(**row) for row in rows]


def get_zone_polygon(db: Connection, level_id: int) -> str | None:
    cursor = db.cursor()
    statement = cursor.execute("SELECT geometry_json FROM zone_polygons")
    row = statement.fetchone()
    if row is None:
        return None

    return row[0]


def get_raster(db: Connection, variable_id: int, ts: datetime) -> LayerRaster | None:
    cursor = db.cursor()
    statement = cursor.execute(
        """
        SELECT
            id,
            file_name, 
            raster_data
        FROM zonal_raster
        WHERE 
            variable_id = ?
            AND date(timestamp) = ?
        """,
        (variable_id, ts.strftime("%Y-%m-%d")),
    )

    row = statement.fetchone()
    if row is None:
        return None

    file_name = f"{row[1][:-4]}.webp"

    return LayerRaster(
        raster_id=row[0], file_name=file_name, data_blob=row[2], variable_id=variable_id
    )

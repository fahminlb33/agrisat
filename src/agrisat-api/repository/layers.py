from sqlite3 import Connection, Row
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class Zone(BaseModel):
    zone_id: int
    hash: str
    level: str
    name: str
    city: str
    area: float


class LayerVariable(BaseModel):
    variable_id: int
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


def list_zones(db: Connection) -> list[Zone]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT *, id AS zone_id FROM zones")
    rows = statement.fetchall()

    return [Zone(**row) for row in rows]


def list_variables(db: Connection) -> list[LayerVariable]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT *, id AS variable_id FROM variables")
    rows = statement.fetchall()

    return [LayerVariable(**row) for row in rows]


def list_indices(db: Connection) -> list[str]:
    cursor = db.cursor()
    statement = cursor.execute(
        "SELECT DISTINCT date(timestamp) AS ts_date FROM zonal_raster"
    )
    rows = statement.fetchall()

    return [x[0] for x in rows]


def get_zone_polygon(db: Connection, level: str) -> list[str]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute("SELECT *, id AS zone_id FROM zones")
    rows = statement.fetchall()
    pass


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

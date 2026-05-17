from sqlite3 import Connection, Row
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class ZoneLevel(BaseModel):
    level_id: int
    level: str


class Zone(BaseModel):
    zone_id: int
    level_id: int
    level: str
    name: str
    city: str
    area: float


class Variable(BaseModel):
    variable_id: int
    type: str
    category: str
    key: str
    name: str
    description: str


class LayerRaster(BaseModel):
    raster_id: int
    variable_id: int
    variable_name: str
    file_name: str
    data_blob: bytes


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_levels(db: Connection) -> list[ZoneLevel]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute(
        """
        SELECT id AS level_id, level FROM zone_level
        """
    )

    return [ZoneLevel(**row) for row in statement.fetchall()]


def list_zones(db: Connection, level_id: Optional[int]) -> list[Zone]:
    cursor = db.cursor()
    cursor.row_factory = Row

    sql = """
    SELECT 
        z.id AS zone_id,
        z.level_id, 
        zl.level, 
        z.name, 
        z.city, 
        z.area
    FROM 
        zones z
    INNER JOIN 
        zone_level zl ON zl.id = z.level_id
    """

    if level_id is not None:
        sql += "\nWHERE z.level_id = ?"
        statement = cursor.execute(sql, (level_id,))
    else:
        statement = cursor.execute(sql)

    return [Zone(**row) for row in statement.fetchall()]


def list_variables(db: Connection) -> list[Variable]:
    cursor = db.cursor()
    cursor.row_factory = Row
    statement = cursor.execute(
        """
        SELECT 
            id AS variable_id,
            type,
            category,
            key,
            name,
            description
        FROM
            variables
        """
    )

    return [Variable(**row) for row in statement.fetchall()]


def get_zone_polygon(db: Connection, level_id: int) -> str | None:
    cursor = db.cursor()
    statement = cursor.execute(
        """
        SELECT 
            geometry_json
        FROM 
            zone_level
        WHERE 
            id = ?
        """,
        (level_id,),
    )

    row = statement.fetchone()
    if row is None:
        return None

    return row[0]


def get_raster(db: Connection, variable_id: int, ts: datetime) -> LayerRaster | None:
    cursor = db.cursor()
    statement = cursor.execute(
        """
        SELECT
            zr.id AS raster_id,
            v.id AS variable_id,
            v.name AS variable_name,
            zr.file_name, 
            zr.raster_data
        FROM
            zonal_raster zr
        INNER JOIN
            variables v ON v.id = zr.variable_id
        WHERE 
            zr.variable_id = ?
            AND date(zr.timestamp) = ?
        """,
        (variable_id, ts.strftime("%Y-%m-%d")),
    )

    row = statement.fetchone()
    if row is None:
        return None

    return LayerRaster(
        raster_id=row[0],
        variable_id=row[1],
        variable_name=row[2],
        file_name=f"{row[3][:-4]}.webp",
        data_blob=row[4],
    )

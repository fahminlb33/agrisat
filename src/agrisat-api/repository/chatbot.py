from sqlite3 import Connection, Row
from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class ChatSession(BaseModel):
    id: int
    name: str
    json_contents: str
    timestamp: str


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def create_session(db: Connection) -> ChatSession:
    cursor = db.cursor()

    sql = "SELECT DISTINCT date(timestamp) FROM zonal_statistics "
    if zone_id is not None:
        sql += " WHERE zone_id = ?"

    statement = (
        cursor.execute(sql, (zone_id,)) if zone_id is not None else cursor.execute(sql)
    )

    return [x[0] for x in statement.fetchall()]


def get_session(db: Connection, session_id: int) -> ChatSession:
    cursor = db.cursor()

    sql = "SELECT DISTINCT date(timestamp) FROM zonal_statistics "
    if zone_id is not None:
        sql += " WHERE zone_id = ?"

    statement = (
        cursor.execute(sql, (zone_id,)) if zone_id is not None else cursor.execute(sql)
    )

    return [x[0] for x in statement.fetchall()]


def save_messages(db: Connection, session_id: int, message_json: list[str]):
    cursor = db.cursor()

    sql = "SELECT DISTINCT date(timestamp) FROM zonal_statistics "
    if zone_id is not None:
        sql += " WHERE zone_id = ?"

    statement = (
        cursor.execute(sql, (zone_id,)) if zone_id is not None else cursor.execute(sql)
    )

    return [x[0] for x in statement.fetchall()]

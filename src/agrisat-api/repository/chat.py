from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class ChatSession(BaseModel):
    id: int
    name: str
    created_at: datetime


class ChatHistory(BaseModel):
    id: int
    session_id: int
    role: str
    contents: str
    created_at: datetime


# ------------------------------------------------------
# Repository
# ------------------------------------------------------


def list_sessions(db: Connection) -> list[ChatSession]:
    cursor = db.cursor()
    items = cursor.execute("SELECT * FROM ").fetchall()

    return [ChatSession(id=x[0], name=x[1], area=x[2]) for x in items]


def create_session(db: Connection, name: str) -> ChatSession:
    cursor = db.cursor()
    now = datetime.now()
    cursor.execute(
        "INSERT INTO chat_sessions(name, created_at) VALUES (?, ?) RETURNING id",
        (name, now.strftime("%Y-%m-%d %H:%M:%S")),
    )
    row = cursor.fetchone()

    return ChatSession(id=row[0], name=name, created_at=now)


def append_history(db: Connection, session_id: int, role: str, contents: str):
    pass


def get_history(db: Connection, session_id: int) -> list[ChatHistory]:
    pass

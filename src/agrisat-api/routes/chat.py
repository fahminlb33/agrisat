from typing import Annotated
from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends

from haystack.dataclasses import ChatMessage
from haystack.components.agents import Agent

from ..agent import get_agent
from ..dependencies import get_settings, get_db
from ..repository.chat import create_session, list_sessions, append_history, get_history

router = APIRouter(prefix="/chat", tags=["Chat"])


# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class CreateSession(BaseModel):
    name: str


class ChatBody(BaseModel):
    session_id: int
    content: str


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/sessions")
async def api_list_sessions():
    sessions = list_sessions()
    return sessions


@router.post("/sessions")
async def api_create_session(
    db: Annotated[Connection, Depends(get_db)], body: CreateSession
):
    session = create_session(db)
    db.commit()

    return session


@router.post("/sessions/{session_id}")
async def api_chat(
    db: Annotated[Connection, Depends(get_db)],
    agent: Annotated[Agent, Depends(get_agent)],
    body: ChatBody,
):
    session_history = get_history(db, body.session_id)
    messages = []

    for item in session_history:
        if item.role == "system":
            messages.append(ChatMessage.from_system(item.contents))
        elif item.role == "user":
            messages.append(ChatMessage.from_user(item.contents))
        elif item.role == "assistant":
            messages.append(ChatMessage.from_assistant(item.contents))

    # append new chat
    messages.append(ChatMessage.from_user(body.content))
    reply = agent.run(messages)
    print(reply)

    reply["last_message"].text

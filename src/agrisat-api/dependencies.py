import secrets
import sqlite3
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .settings import Settings

security = HTTPBasic()


# -----------------------------------------------------------
# Settings
# -----------------------------------------------------------


@lru_cache
def get_settings():
    return Settings()


# -----------------------------------------------------------
# Authentication
# -----------------------------------------------------------


def get_current_user(
    credentials: Annotated[HTTPBasicCredentials, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    is_correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"), settings.api_username.encode("utf8")
    )
    is_correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"), settings.api_password.encode("utf8")
    )

    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


# -----------------------------------------------------------
# Database
# -----------------------------------------------------------


def get_db(settings: Annotated[Settings, Depends(get_settings)]):
    connection = sqlite3.connect(settings.dsn, check_same_thread=False)
    try:
        yield connection
    finally:
        connection.close()

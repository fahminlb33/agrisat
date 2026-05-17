from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    allow_origins: list[str] = ["http://localhost", "http://localhost:8080", "*"]

    agent_web: bool = True
    agent_dsn: str = "sqlite+aiosqlite:///./sessions.db"

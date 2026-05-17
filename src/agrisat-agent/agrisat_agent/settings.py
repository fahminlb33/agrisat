from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    api_host: str
    api_username: str
    api_password: str

    gemini_model: str
    gemini_api_key: str

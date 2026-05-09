import sqlite3
from typing import Annotated
from textwrap import dedent

from haystack.components.agents import Agent
from haystack.tools import create_tool_from_function
from haystack_integrations.components.generators.google_genai import (
    GoogleGenAIChatGenerator,
)

from .dependencies import get_settings

# ------------------------------------------------------
# Tools
# ------------------------------------------------------


def get_zones(group: Annotated[str, ""]):
    settings = get_settings()
    connection = sqlite3.connect(settings.dsn, check_same_thread=False)


def get_weather_data(
    zone_id: Annotated[int, ""],
    start_date: Annotated[str, ""],
    end_date: Annotated[str, ""],
):
    settings = get_settings()
    connection = sqlite3.connect(settings.dsn, check_same_thread=False)


def get_environmental_data(
    zone_id: Annotated[int, ""],
    start_date: Annotated[str, ""],
    end_date: Annotated[str, ""],
):
    settings = get_settings()
    connection = sqlite3.connect(settings.dsn, check_same_thread=False)


# ------------------------------------------------------
# Agent
# ------------------------------------------------------

SYSTEM_PROMPT = dedent(
    """
    TESTING TESTING
    """
)


def get_agent():
    settings = get_settings()
    generator = GoogleGenAIChatGenerator(
        model=settings.gemini_model, api_key=settings.gemini_api_key, api="gemini"
    )

    zones_tool = create_tool_from_function(get_zones)
    weather_tool = create_tool_from_function(get_weather_data)
    environmental_tool = create_tool_from_function(get_environmental_data)

    agrisat_agent = Agent(
        chat_generator=generator,
        system_prompt=SYSTEM_PROMPT,
        tools=[zones_tool, weather_tool, environmental_tool],
    )

    return agrisat_agent

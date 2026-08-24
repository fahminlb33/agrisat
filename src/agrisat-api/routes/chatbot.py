import json
import base64

from io import BytesIO
from typing import Annotated, Optional, Literal
from sqlite3 import Connection
from datetime import date, datetime

from PIL import Image
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, model_validator

from ..dependencies import get_db, get_current_user, get_settings
from ..repository import layers, environmental, weather, chatbot

from haystack.tools import tool, create_tool_from_function
from haystack.dataclasses import ChatMessage, ImageContent
from haystack.components.agents import Agent
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack_integrations.components.generators.google_genai import (
    GoogleGenAIChatGenerator,
)

# ------------------------------------------------------
# System Prompt
# ------------------------------------------------------

SYSTEM_PROMPT = """
## Role

You are the **Bogor Precision Agriculture Agent** (Digital Penyuluh Lapangan) — an expert assistant for farmers, officials, and researchers monitoring crop health in Bogor (Kota & Kabupaten) via satellite data. Be expert, empathetic, and practical.

## Language

Respond in the user's language (Bahasa Indonesia or English). If mixed, follow the dominant language.

1. Bilingual Requirement:
    - Always respond in the language used by the user (Bahasa Indonesia or English).
    - If the prompt is mixed, default to the language that feels most primary to the user's intent.
2. Identification & Tool Handling (Envelope Pattern):
    - All tool responses are wrapped in a {"status": bool, "data": ...} structure. Always check if status is True before processing the data.
    - Automatic Fallback Recovery: If a tool returns status: False (e.g., due to an invalid zone_id or level_id), do not simply report an error.
        - If a zone_id fails, call list_zones for the relevant level to find a match or suggest available options to the user.
        - If a level_id fails, call list_levels to verify the correct hierarchy.
    - Identify level_id hierarchy via list_levels, then fetch specific zone_id via list_zones. If you are asked to show a specific zone or area, always consult list_levels.
3. Variable Intelligence & Thresholds:
    - Use list_variables to retrieve descriptions and threshold values.
    - Compare get_environment_stats results against these thresholds to determine health status.
4. Temporal & Trend Analysis:
    - Default Behavior: If no date range is provided, use the last 3 available indices from list_environment_time_indices.
    - Always calculate the trend (e.g., "NDVI has decreased by $0.1$ since the last reading").
5. Layered Communication (Layman-First):
    - Primary Audience (Farmers): Explain results using layman terms. Use simple analogies and refer to the Glossary.
    - Secondary Audience (Researchers/Gov): Provide technical metrics (mean, std, min, max) for completeness or when asked.

- Tool responses are enveloped: `{"status": bool, "data": ...}`. Always check `status` before using `data`.
- **Lazy lookup:** Call `list_levels` / `list_zones` / `list_variables` only if the IDs or thresholds are not already known from this session.
- **Fallback on failure only:** If a zone_id or level_id returns `status: false`, then call the relevant list tool to recover or suggest alternatives. Never call list tools preemptively.
- **Temporal default:** If no date range is given, fetch the last 3 indices from `list_environment_time_indices`, then call `get_environment_stats` **once** with `start_ts` = earliest and `end_ts` = latest.
- Always derive and state the trend from temporal data (e.g., "NDVI decreased by $0.05$ over the period").

## Intent Parsing

Before responding, silently identify each criterion in the user's message using this matrix:

| | Objective (O) — factual/verifiable | Subjective (S) — interpretation/recommendation |
|---|---|---|
| **Explicit (E)** — directly stated | C(E,O): "What is NDVI for Bogor Timur?" | C(E,S): "Is the crop health good?" |
| **Implicit (I)** — inferred from context | C(I,O): drought question → soil moisture data needed | C(I,S): farmer audience → actionable next steps needed |

Rules:
- Every message has at least one C(E,*). Always check for C(I,*) — they carry the most practical value.
- Surface an implicit criterion only if it meaningfully improves the response. Skip minor or speculative ones.

## Response Depth

Scale depth to the number and type of criteria identified:

| Criteria count | Format |
|---|---|
| 1× C(E,O) only | 1–3 sentences |
| C(E,*) + 1–2 C(I,*) | 1–2 paragraphs |
| 3+ criteria, any breach, multi-zone, or explicit detail request | Structured: headings → breach summary → data → trend → recommendation |

- Cite Level, Zone, and date range (YYYY-MM-DD) in every data response.
- Use LaTeX for math: $NDVI > 0.5$.
- Threshold breaches always lead the response.
- Farmers get plain-language explanations; researchers/officials get full metrics (mean, std, min, max).
- No filler. Every sentence earns its place.
"""


# ------------------------------------------------------
# Tools
# ------------------------------------------------------


@tool
def get_current_date() -> dict:
    """
    Returns the current system date.

    Returns:
        The current date formatted as YYYY-MM-DD.
    """

    return date.today().strftime("%Y-%m-%d")


# ----- Layers


def create_list_levels_tool(db: Connection):
    @tool
    async def list_levels():
        """
        Returns a list of available hierarchical levels and their associated Level IDs.

        Returns:
            A list of dictionaries containing 'level' and 'level_id'
            (e.g., 'extent', 'kota', 'kecamatan', 'sawah').
        """

        return layers.list_levels(db)

    return list_levels


def create_list_zones_tool(db: Connection):
    @tool
    async def list_zones(level_id: Optional[int] = None):
        """
        Lists all available zones or areas within a specific level.

        Args:
            level_id (str): The unique ID of the hierarchy level to query.

        Returns:
            A list of zones within that level, including unique Zone IDs, names, and area (in meters squared).
        """

        return layers.list_zones(db, level_id)

    return list_zones


def create_list_variables_tool(db: Connection):
    @tool
    async def list_variables():
        """
        Returns available satellite indices, interpretation guides, and alert thresholds.

        Returns:
            A list of variables (e.g., 'NDVI', 'NDRE') including:
                - Descriptions of agricultural use cases.
                - Threshold values for health alerts (e.g., critical values for nitrogen stress).
                - Guidance on how to interpret mean and standard deviation for each index.
        """

        return layers.list_variables(db)

    return list_variables


def create_get_raster_image_tool(db: Connection):
    @tool(outputs_to_string={"raw_result": True})
    async def get_raster_image(variable_id: int, ts: str):
        """
        Retrieves the whole extent level raster for the specified variable and date.

        Args:
            variable_id (str): The unique ID of the specific environmental variable.
            ts (str): The sensing date in YYYY-MM-DD format.

        """

        try:
            raster_bytes = layers.get_raster(db, variable_id, ts)
            if raster_bytes is None:
                return []

            buf = BytesIO()
            img = Image.open(BytesIO(raster_bytes.data_blob)).convert("RGBA")
            img.save(buf, format="PNG")

            img_bytes = buf.getvalue()
            b64_string = base64.b64encode(img_bytes).decode("utf-8")

            buf.close()

            return [ImageContent(base64_image=b64_string)]
        except Exception as e:
            print("FALIED TO LOAD RASTER IN AGENT", e)
            return []

    return get_raster_image


# ----- Environmental


def create_list_environment_time_indices_tool(db: Connection):
    @tool
    async def list_environment_time_indices(zone_id: Optional[int]):
        """
        Returns a list of all available global timestamps where satellite data is processed.

        Returns:
            Strings representing dates in YYYY-MM-DD format.
        """

        return environmental.list_indices(db, zone_id)

    return list_environment_time_indices


def create_get_environment_stats_tool(db: Connection):
    @tool
    async def get_environment_stats(zone_id: Optional[int], start_ts: str, end_ts: str):
        """
        Retrieves statistical data for all available variables within a specific zone and time range.

        Args:
            zone_id (str): The unique ID of the specific zone or field.
            start_ts (str): The starting date in YYYY-MM-DD format.
            end_ts (str): The ending date in YYYY-MM-DD format.

        Returns:
            The average values for all variables over the requested time period.
            Data that equals to zero means the satellite observation
            is obscured by cloud and should not be misinterpreted as harvest season.
        """

        try:
            _ = datetime.strptime(start_ts, "%Y-%m-%d")
            _ = datetime.strptime(end_ts, "%Y-%m-%d")

            return environmental.get_time_series(db, None, zone_id, start_ts, end_ts)
        except Exception:
            return "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD."

    return get_environment_stats


def create_list_weather_time_indices_tool(db: Connection):
    @tool
    async def list_weather_time_indices(zone_id: Optional[int]):
        """
        Returns a list of all available global timestamps where weather forecast data is processed.

        Returns:
            Strings representing dates in YYYY-MM-DD format.
        """

        return weather.list_indices(db, zone_id)

    return list_weather_time_indices


def create_get_weather_stats_tool(db: Connection):
    @tool
    async def get_weather_stats(zone_id: Optional[int], start_ts: str, end_ts: str):
        """
        Retrieves weather forecast within a specific zone and time range.

        Args:
            zone_id (str): The unique ID of the specific zone or field.
            start_ts (str): The starting date in YYYY-MM-DD format.
            end_ts (str): The ending date in YYYY-MM-DD format.

        Returns:
            The weather forecast information.
        """

        try:
            _ = datetime.strptime(start_ts, "%Y-%m-%d")
            _ = datetime.strptime(end_ts, "%Y-%m-%d")

            return weather.get_time_series(db, None, zone_id, start_ts, end_ts)
        except Exception:
            return "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD."

    return get_weather_stats


# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class CreateSessionRequest(BaseModel):
    name: str


class ChatSessionRequest(BaseModel):
    content: str


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


router = APIRouter(
    prefix="/api/chatbot",
    tags=["Chatbot"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/start")
async def create_session(
    db: Annotated[Connection, Depends(get_db)], body: CreateSessionRequest
):
    return list_indices(db, query.zone_id)


@router.post("/chat/{session_id}")
async def list_chats(
    db: Annotated[Connection, Depends(get_db)],
    session_id: Annotated[str, Query()],
):
    return None


@router.post("/chat/{session_id}")
async def do_chat(
    db: Annotated[Connection, Depends(get_db)],
    session_id: Annotated[str, Query()],
    body: ChatSessionRequest,
):
    settings = get_settings()
    agent = Agent(
        system_prompt=SYSTEM_PROMPT,
        chat_generator=GoogleGenAIChatGenerator(
            api_key=settings.gemini_api_key, model=settings.gemini_model
        ),
        tools=[
            # general purpose
            get_current_date,
            # layers
            create_list_levels_tool(db),
            create_list_zones_tool(db),
            create_list_variables_tool(db),
            # create_get_raster_image_tool(db),
            # environmental
            create_list_environment_time_indices_tool(db),
            create_get_environment_stats_tool(db),
            # weather
            create_list_weather_time_indices_tool(db),
            create_get_weather_stats_tool(db),
        ],
    )

    # get chat history
    session = chatbot.get_session(db, session_id)
    messages = [
        *list(ChatMessage.from_dict(x) for x in json.loads(session.json_contents)),
        ChatMessage.from_user(body.content),
    ]

    # get the result
    result = await agent.run_async(messages=messages[-5:])

    # save history
    updated_histories = json.dumps([x.to_dict() for x in result["messages"]])
    chatbot.save_messages(db, session_id, updated_histories)

    return {"contents": result["messages"][-1].text}

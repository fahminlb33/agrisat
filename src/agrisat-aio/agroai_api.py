from datetime import date, datetime
from sqlite3 import Connection, Row

from haystack.components.agents import Agent
from haystack.tools import tool
from haystack.utils import Secret
from haystack_integrations.components.generators.google_genai import (
    GoogleGenAIChatGenerator,
)
from shared_data import get_connection

# ------------------------------------------------------
# System Prompt
# ------------------------------------------------------

SYSTEM_PROMPT = """async
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
    def list_levels():
        """
        Returns a list of available hierarchical levels and their associated Level IDs.

        Returns:
            A list of dictionaries containing 'level' and 'level_id'
            (e.g., 'extent', 'kota', 'kecamatan', 'sawah').
        """

        cursor = db.cursor()
        cursor.row_factory = Row
        statement = cursor.execute(
            """
            SELECT id AS level_id, level FROM zone_level
            """
        )

        return [dict(row) for row in statement.fetchall()]

    return list_levels


def create_list_zones_tool(db: Connection):
    @tool
    def list_zones(level_id: int | None = None):
        """
        Lists all available zones or areas within a specific level.

        Args:
            level_id (str): The unique ID of the hierarchy level to query.

        Returns:
            A list of zones within that level, including unique Zone IDs, names, and area (in meters squared).
        """

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

        return [dict(row) for row in statement.fetchall()]

    return list_zones


def create_list_variables_tool(db: Connection):
    @tool
    def list_variables():
        """
        Returns available satellite indices, interpretation guides, and alert thresholds.

        Returns:
            A list of variables (e.g., 'NDVI', 'NDRE') including:
                - Descriptions of agricultural use cases.
                - Threshold values for health alerts (e.g., critical values for nitrogen stress).
                - Guidance on how to interpret mean and standard deviation for each index.
        """

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

        return [dict(row) for row in statement.fetchall()]

    return list_variables


# ----- Environmental


def create_list_environment_time_indices_tool(db: Connection):
    @tool
    def list_environment_time_indices(zone_id: int | None = None):
        """
        Returns a list of all available global timestamps where satellite data is processed.

        Returns:
            Strings representing dates in YYYY-MM-DD format.
        """

        cursor = db.cursor()

        sql = "SELECT DISTINCT date(timestamp) FROM zonal_statistics "
        if zone_id is not None:
            sql += " WHERE zone_id = ?"

        statement = (
            cursor.execute(sql, (zone_id,))
            if zone_id is not None
            else cursor.execute(sql)
        )

        return [x[0] for x in statement.fetchall()]

    return list_environment_time_indices


def create_environment_ts_tool(db: Connection):
    @tool
    def get_environment_time_series(zone_id: int, start_ts: str, end_ts: str):
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

            cursor = db.cursor()
            cursor.row_factory = Row

            statement = cursor.execute(
                """
                SELECT
                    zs.*,
                    z.name AS zone_name,
                    z.city AS zone_city,
                    zl.id AS level_id,
                    zl.level AS level
                FROM 
                    zonal_statistics zs
                INNER JOIN 
                    zones z ON z.id = zs.zone_id
                INNER JOIN 
                    zone_level zl ON zl.id = z.level_id
                WHERE 
                    z.id = ?
                    AND date(timestamp) BETWEEN ? AND ?
                """,
                (
                    zone_id,
                    start_ts,
                    end_ts,
                ),
            )

            return [dict(x) for x in statement.fetchall()]
        except Exception:
            return "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD."

    return get_environment_time_series


def create_weather_time_indices_tool(db: Connection):
    @tool
    def list_weather_time_indices():
        """
        Returns a list of all available global timestamps where weather forecast data is processed.

        Returns:
            Strings representing dates in YYYY-MM-DD format.
        """

        cursor = db.cursor()
        statement = cursor.execute(
            "SELECT DISTINCT date(timestamp) AS ts FROM zonal_weather"
        )

        return [x[0] for x in statement.fetchall()]

    return list_weather_time_indices


def create_weather_ts_tool(db: Connection):
    @tool
    def get_weather_time_series(zone_id: int, start_ts: str, end_ts: str):
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

            cursor = db.cursor()
            cursor.row_factory = Row

            statement = cursor.execute(
                """
                SELECT
                    zw.timestamp,
                    CASE WHEN zw.temperature > 100 THEN zw.temperature - 273.15 ELSE zw.temperature END AS temperature,
                    zw.precipitation,
                    zw.cloud_cover * 100 AS cloud_cover_pct,
                    zw.is_raining
                FROM
                    zonal_weather zw
                INNER JOIN
                    zones z ON z.id = zw.zone_id
                INNER JOIN
                    zone_level zl ON zl.id = z.level_id
                WHERE 
                    z.id = ?
                    AND date(timestamp) BETWEEN ? AND ?
                """,
                (
                    zone_id,
                    start_ts,
                    end_ts,
                ),
            )

            return [dict(x) for x in statement.fetchall()]
        except Exception:
            return "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD."

    return get_weather_time_series


def get_agent(api_key: str, model_name: str):
    db = get_connection()

    return Agent(
        system_prompt=SYSTEM_PROMPT,
        chat_generator=GoogleGenAIChatGenerator(
            api_key=Secret.from_token(api_key), model=model_name
        ),
        tools=[
            # general purpose
            get_current_date,
            # layers
            create_list_levels_tool(db),
            create_list_zones_tool(db),
            create_list_variables_tool(db),
            # environmental
            create_list_environment_time_indices_tool(db),
            create_environment_ts_tool(db),
            # weather
            create_weather_time_indices_tool(db),
            create_weather_ts_tool(db),
        ],
    )

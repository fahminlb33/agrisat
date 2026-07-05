import os
from io import BytesIO
from typing import Optional
from datetime import date, datetime

from PIL import Image
from httpx import AsyncClient, BasicAuth
from google.genai import types
from google.adk.tools import ToolContext


def _get_async_client() -> AsyncClient:
    return AsyncClient(
        base_url=os.environ.get("API_HOST", "http://localhost:8000"),
        auth=BasicAuth(
            os.environ.get("API_USERNAME", "agrisat-demo"),
            os.environ.get("API_PASSWORD", "agrisat-demo"),
        ),
    )


# ------------------------------------------------------
# Common Tools
# ------------------------------------------------------


def get_current_date() -> dict:
    """
    Returns the current system date.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (str): The current date formatted as YYYY-MM-DD.
    """

    return {"success": True, "date": date.today().strftime("%Y-%m-%d")}


# ------------------------------------------------------
# API-based Tools
# ------------------------------------------------------


async def list_levels(tool_context: ToolContext) -> dict:
    """
    Returns a list of available hierarchical levels and their associated Level IDs.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (list): A list of dictionaries containing 'level' and 'level_id'
                (e.g., 'extent', 'kota', 'kecamatan', 'sawah').
    """

    key = "cache:levels"
    if key in tool_context.state:
        return {"status": True, "data": tool_context.state[key]}
    async with _get_async_client() as client:
        res = await client.get("/layers/levels")
        data = res.json()
    tool_context.state[key] = data
    return {"status": True, "data": data}


async def list_zones(tool_context: ToolContext, level_id: Optional[int] = None) -> dict:
    """
    Lists all available zones or areas within a specific level.

    Args:
        level_id (str): The unique ID of the hierarchy level to query.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (list): A list of zones within that level, including unique Zone IDs, names, and area (in meters squared).
    """

    key = f"cache:zones:{level_id}"
    if key in tool_context.state:
        return {"status": True, "data": tool_context.state[key]}
    async with _get_async_client() as client:
        res = await client.get("/layers/zones", params={"level_id": level_id})
        data = res.json()
    tool_context.state[key] = data
    return {"status": True, "data": data}


async def list_variables(tool_context: ToolContext) -> dict:
    """
    Returns available satellite indices, interpretation guides, and alert thresholds.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (list): A list of variables (e.g., 'NDVI', 'NDRE') including:
                - Descriptions of agricultural use cases.
                - Threshold values for health alerts (e.g., critical values for nitrogen stress).
                - Guidance on how to interpret mean and standard deviation for each index.
    """

    key = "cache:variables"
    if key in tool_context.state:
        return {"status": True, "data": tool_context.state[key]}
    async with _get_async_client() as client:
        res = await client.get("/layers/variables")
        data = res.json()
    tool_context.state[key] = data
    return {"status": True, "data": data}


async def list_environment_time_indices(zone_id: Optional[int]):
    """
    Returns a list of all available global timestamps where satellite data is processed.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (list): Strings representing dates in YYYY-MM-DD format.
    """

    async with _get_async_client() as client:
        res = await client.get("/environmental/indices", params={"zone_id": zone_id})
        return {"status": True, "data": res.json()}


async def get_environment_stats(zone_id: Optional[int], start_ts: str, end_ts: str):
    """
    Retrieves statistical data for all available variables within a specific zone and time range.

    Args:
        zone_id (str): The unique ID of the specific zone or field.
        start_ts (str): The starting date in YYYY-MM-DD format.
        end_ts (str): The ending date in YYYY-MM-DD format.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (dict): The average values for all variables
                over the requested time period.
                Data that equals to zero means the satellite observation
                is obscured by cloud and should not be misinterpreted as harvest season.
    """

    try:
        _ = datetime.strptime(start_ts, "%Y-%m-%d")
        _ = datetime.strptime(end_ts, "%Y-%m-%d")

        async with _get_async_client() as client:
            res = await client.get(
                "/environmental/",
                params={
                    "zone_id": zone_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )

            return {"status": True, "data": res.json()}
    except Exception:
        return {
            "status": True,
            "error": "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD.",
        }


async def list_weather_time_indices():
    """
    Returns a list of all available global timestamps where weather forecast data is processed.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (list): Strings representing dates in YYYY-MM-DD format.
    """

    async with _get_async_client() as client:
        res = await client.get("/weather/indices")
        return {"status": True, "data": res.json()}


async def get_weather_stats(zone_id: int, start_ts: str, end_ts: str):
    """
    Retrieves weather forecast within a specific zone and time range.

    Args:
        zone_id (str): The unique ID of the specific zone or field.
        start_ts (str): The starting date in YYYY-MM-DD format.
        end_ts (str): The ending date in YYYY-MM-DD format.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (dict): The weather forecast information.
    """

    try:
        _ = datetime.strptime(start_ts, "%Y-%m-%d")
        _ = datetime.strptime(end_ts, "%Y-%m-%d")

        async with _get_async_client() as client:
            res = await client.get(
                "/weather/",
                params={
                    "zone_id": zone_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )

            return {"status": True, "data": res.json()}
    except Exception:
        return {
            "status": True,
            "error": "Failed to parse the start_ts or end_ts. Make sure the input format is YYYY-MM-DD.",
        }


async def get_environment_raster(tool_context: ToolContext, variable_id: int, ts: str):
    """
    Retrieves the whole extent level raster for the specified variable and date.

    Args:
        variable_id (str): The unique ID of the specific environmental variable.
        ts (str): The sensing date in YYYY-MM-DD format.

    Returns:
        dict: A dictionary containing:
              - 'success' (bool): True if successful.
              - 'data' (dict): The raster artifact information.
    """

    try:
        artifact_id = f"{variable_id}_{ts}.png"

        # check if we already cached this raster
        artifacts = await tool_context.list_artifacts()
        if artifact_id in artifacts:
            return {
                "status": True,
                "tool_response_artifact_id": artifact_id,
            }

        async with _get_async_client() as client:
            result = await client.get(
                "/layers/rasters",
                params={
                    "variable_id": variable_id,
                    "ts": ts,
                },
            )

            if result.content is None or len(result.content) == 0:
                return {"status": False, "error": "No raster found"}

            variable_name = result.headers.get("Agrisat-Variable", variable_id)

            # convert WEBP to PNG
            img = Image.open(BytesIO(result.content)).convert("RGBA")
            buf = BytesIO()
            img.save(buf, format="PNG")

            # save to artifact
            blob = types.Blob(data=buf.getvalue(), mime_type="image/png")
            part = types.Part(inline_data=blob)
            await tool_context.save_artifact(artifact_id, part)

            buf.close()

            return {
                "status": True,
                "variable_name": variable_name,
                "tool_response_artifact_id": artifact_id,
            }
    except ValueError:
        return {"status": False, "error": "Invalid ts format. Use YYYY-MM-DD."}
    except Exception as e:
        return {"status": False, "error": f"Unexpected error: {type(e).__name__}"}

import os
from typing import Optional
from datetime import date

from httpx import Client, BasicAuth


# ------------------------------------------------------
# Common Tools
# ------------------------------------------------------


def get_current_date() -> dict:
    """
    Returns the current system date.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (str): The current date formatted as YYYY-MM-DD.
    """

    return {"status": "success", "date": date.today().strftime("%Y-%m-%d")}


# ------------------------------------------------------
# API-based Tools
# ------------------------------------------------------


def get_client():
    return Client(
        base_url=os.environ.get("API_HOST"),
        auth=BasicAuth(os.environ.get("API_USERNAME"), os.environ.get("API_PASSWORD")),
    )


def list_levels():
    """
    Returns a list of available hierarchical levels and their associated Level IDs.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (list): A list of dictionaries containing 'level' and 'level_id'
                (e.g., 'extent', 'kota', 'kecamatan', 'sawah').
    """

    with get_client() as client:
        res = client.get("/layers/levels")
        return res.json()


def list_zones(level_id: Optional[int] = None):
    """
    Lists all available zones or areas within a specific level.

    Args:
        level_id (str): The unique ID of the hierarchy level to query.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (list): A list of zones within that level, including unique Zone IDs and names.
    """

    with get_client() as client:
        res = client.get("/layers/zones", params={"level_id": level_id})
        return res.json()


def list_variables():
    """
    Returns available satellite indices, interpretation guides, and alert thresholds.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (list): A list of variables (e.g., 'NDVI', 'NDRE') including:
                - Descriptions of agricultural use cases.
                - Threshold values for health alerts (e.g., critical values for nitrogen stress).
                - Guidance on how to interpret mean and standard deviation for each index.
    """

    with get_client() as client:
        res = client.get("/layers/variables")
        return res.json()


def list_environment_time_indices():
    """
    Returns a list of all available global timestamps where satellite data is processed.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (list): Strings representing dates in YYYY-MM-DD format.
    """

    with get_client() as client:
        res = client.get("/environmental/indices")
        return res.json()


def get_environment_stats(zone_id: Optional[int], start_ts: str, end_ts: str):
    """
    Retrieves statistical data for all available variables within a specific zone and time range.

    Args:
        zone_id (str): The unique ID of the specific zone or field.
        start_ts (str): The starting date in YYYY-MM-DD format.
        end_ts (str): The ending date in YYYY-MM-DD format.

    Returns:
        dict: A dictionary containing:
              - 'status' (bool): True if successful.
              - 'data' (dict): The average values for all variables
                over the requested time period.
    """

    with get_client() as client:
        res = client.get(
            "/environmental/",
            params={
                "zone_id": zone_id,
                "start_ts": start_ts,
                "end_ts": end_ts,
            },
        )

        return res.json()

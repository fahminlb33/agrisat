import base64
import datetime
from io import BytesIO

import geopandas as gpd
import numpy as np
import pandas as pd
from cmap import Colormap
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.warp import transform_bounds
from shared_data import get_connection

# ----------------------------------------------
# Sidebar
# ----------------------------------------------


def load_levels():
    with get_connection() as conn:
        cursor = conn.cursor()
        statement = cursor.execute("SELECT level FROM zone_level")

        return [x[0].upper() for x in statement.fetchall()]


def load_zones(level: str):
    with get_connection() as conn:
        cursor = conn.cursor()
        statement = cursor.execute(
            f"""
            SELECT 
                z.city, z.name, z.id
            FROM 
                zones z 
            INNER JOIN 
                zone_level zl ON zl.id = z.level_id
            WHERE
                zl.level = '{level.lower()}'
            ORDER BY
                z.city DESC, z.name ASC
            """
        )

        return [f"{x[0]} - {x[1]} ({x[2]})" for x in statement.fetchall()]


# ----------------------------------------------
# Map
# ----------------------------------------------


def load_map_time_indices():
    with get_connection() as conn:
        cursor = conn.cursor()
        statement = cursor.execute(
            "SELECT DISTINCT date(timestamp) AS ts FROM zonal_statistics"
        )

        rows = statement.fetchall()

        return [datetime.datetime.strptime(x[0], "%Y-%m-%d").date() for x in rows]


def load_vegetation_time_series(zone_id: int):
    with get_connection() as conn:
        sql = f"""
            SELECT
                zs.*
            FROM 
                zonal_statistics zs
            WHERE 
                zs.zone_id = '{zone_id}'
            """

        return pd.read_sql_query(sql, conn)


def render_map(timestamp: str, level: str, vegetation_index: str):
    # --- phase 1 - data collection
    with get_connection() as conn:
        cursor = conn.cursor()

        # get the environmental data
        sql = f"""
            SELECT
                z.hash AS hash,
                zs.*
            FROM 
                zonal_statistics zs 
            INNER JOIN
                zones z ON z.id = zs.zone_id
            INNER JOIN
                zone_level zl ON zl.id = z.level_id
            WHERE 
                zl.level = '{level}' AND 
                date(zs.timestamp) = '{timestamp}'
            """

        df_environment = pd.read_sql_query(sql, conn).drop(
            columns=["id", "zone_id", "timestamp"]
        )

        # get the vector polygon
        statement = cursor.execute(
            f"SELECT geometry_json FROM zone_level WHERE level = '{level}'"
        )
        vector_geojson = statement.fetchone()[0]
        gdf_vector = gpd.read_file(BytesIO(vector_geojson.encode("utf-8"))).drop(
            columns=["id", "level", "city"]
        )

        # get the raster
        statement = cursor.execute(
            f"""
            SELECT 
                zr.raster_data
            FROM 
                zonal_raster zr
            INNER JOIN
                variables v ON v.id = zr.variable_id
            WHERE 
                date(zr.timestamp) = '{timestamp}' AND
                v.key = '{vegetation_index}'
            """
        )

        img_bytes = statement.fetchone()[0]

    # --- phase 2.1 - preprocessing: combine vector and attribute data
    df_map = gdf_vector.merge(df_environment, on="hash").set_index("hash")

    # --- phase 2.2 - preprocessing: render raster data
    with MemoryFile(img_bytes) as memfile, memfile.open() as src:
        img_data = src.read(1)
        if src.nodata is not None:
            img_data = np.where(img_data == src.nodata, np.nan, img_data)

        min_val = np.nanmin(img_data)
        max_val = np.nanmax(img_data)
        normalized_band = (img_data - min_val) / (max_val - min_val)

        cmap = Colormap("matplotlib:viridis")
        rgba_uint8 = cmap(normalized_band, bytes=True)

        img_data_png = BytesIO()
        img = Image.fromarray(rgba_uint8)
        img.save(img_data_png, "png")

        img_b64 = base64.b64encode(img_data_png.getvalue()).decode("utf-8")
        img_url = f"data:image/png;base64,{img_b64}"

        west, south, east, north = transform_bounds(
            src.crs,
            "EPSG:4326",
            src.bounds.left,
            src.bounds.bottom,
            src.bounds.right,
            src.bounds.top,
        )

        img_bounds = [[west, north], [east, north], [east, south], [west, south]]
        map_center = {"lat": (south + north) / 2, "lon": (west + east) / 2}

    return df_map, img_url, img_bounds, map_center


# ----------------------------------------------
# Weather
# ----------------------------------------------


def load_weather_time_indices():
    with get_connection() as conn:
        cursor = conn.cursor()
        statement = cursor.execute(
            "SELECT DISTINCT date(timestamp) AS ts FROM zonal_weather"
        )

        rows = statement.fetchall()

        return (
            datetime.datetime.strptime(rows[0][0], "%Y-%m-%d").date(),
            datetime.datetime.strptime(rows[-1][0], "%Y-%m-%d").date(),
        )


def load_weather_time_series(
    zone_id: int,
    start_ts: datetime,
    end_ts: datetime,
):
    start_ts_str = datetime.date.strftime(start_ts, "%Y-%m-%d")
    end_ts_str = datetime.date.strftime(end_ts, "%Y-%m-%d")

    sql = f"""
            SELECT
                zw.timestamp,
                z.name AS zone_name,
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
                z.id = {zone_id} AND
                date(timestamp) BETWEEN '{start_ts_str}' AND '{end_ts_str}'
            """

    with get_connection() as conn:
        return pd.read_sql_query(sql, conn, parse_dates=["timestamp"])

import json
import shutil
import zipfile
import argparse
import subprocess
from io import StringIO
from abc import ABC, abstractmethod
from pathlib import Path
from datetime import datetime
from typing import TypedDict

from tqdm import tqdm
from rich import print
from dotenv import dotenv_values

import xarray as xr
import pandas as pd
import geopandas as gpd


class FileEntry(TypedDict):
    timestamp: str
    variable: str
    path: str


def derive_statistics(reproject: bool, mask: Path, raster: Path):
    cmd_reproject = []
    if reproject:
        cmd_reproject = [
            "reproject",
            "--src-crs", "EPSG:4326",
            "--dst-crs", "EPSG:32748",
            "!",
        ]  # fmt: skip

    cmd_final = [
        # start pipeline
        "gdal", "pipeline", 
        # read input
        "read", raster, "!",
        # reproject CRS
        *cmd_reproject,
        # perform zonal statistics
        "zonal-stats",
        "--band", "1",
        "--zones", "[", "read", mask, "]",
        "--stat", "count,min,max,sum,mean,stdev",
        "--pixels", "fractional", "!",
        # write to file
        "write",
        "--output-format", "CSV",
        "--output", "/vsistdout/"
    ]  # fmt: skip

    result = subprocess.run(cmd_final, capture_output=True, text=True)
    if result.returncode != 0:
        print("--------------------------------------------------")
        print("An error has occured when running gdal_translate!")
        print("STDOUT", result.stdout)
        print("STDERR", result.stderr)
        print("--------------------------------------------------")
        return None

    return pd.read_csv(StringIO(result.stdout))


def discover_files(path: Path) -> list[FileEntry]:
    print("Discovering files...")

    files = []
    for file_path in path.glob("**/*.tif"):
        timestamp = file_path.stem
        variable_name = file_path.parent.name

        files.append(
            {
                "timestamp": timestamp,
                "variable": variable_name,
                "path": file_path,
            }
        )

    return files


# ------------------------------------------------
# Entry Point
# ------------------------------------------------

# Data sources
# ERA5 Land  | Weather Reanalysis
# ECMWF      | Weather Forecast
# Sentinel-2 | Environmental Data


def main(args):
    data_path = Path(args["data_path"])

    data = []
    files = discover_files(data_path)
    df_mask = gpd.read_file(args["mask_path"])

    # process all variables
    for file in tqdm(files):
        df_stats = derive_statistics(args["reproject"], args["mask_path"], file["path"])
        if df_stats is None:
            continue

        df_stats = df_stats.assign(
            timestamp=file["timestamp"], variable=file["variable"]
        )
        df_stats["hash"] = df_mask["hash"]

        data.append(df_stats)

    # save data
    df = pd.concat(data, ignore_index=True)
    print(df.head())

    df.to_csv(args["output_path"], index=None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reproject", action="store_true")
    parser.add_argument(
        "--data-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/environmental",
    )
    parser.add_argument(
        "--mask-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/area-of-interest/bogor-sawah.geojson",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/attributes/zonal-stats.csv",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

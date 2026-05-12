import argparse
import subprocess
import multiprocessing
from io import StringIO
from typing import TypedDict
from pathlib import Path
from functools import partial

from tqdm import tqdm
from rich import print

import pandas as pd
import geopandas as gpd

# ------------------------------------------------
# Data Processing
# ------------------------------------------------


class FileEntry(TypedDict):
    timestamp: str
    variable: str
    file_path: str
    file_name: str


class StatisticsResult(TypedDict):
    success: bool
    csv_data: str
    timestamp: str
    variable: str
    file_path: str
    file_name: str


def parse_filename(p: Path) -> str:
    return str(p.relative_to(p.parent.parent))


def derive_statistics(
    entry: FileEntry, mask: Path, reproject: bool
) -> StatisticsResult:
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
        "read", entry["file_path"], "!",
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
        return {"success": False, "csv_data": None, **entry}

    return {"success": True, "csv_data": result.stdout, **entry}


# ------------------------------------------------
# Entry Point
# ------------------------------------------------

# Data sources
# ERA5 Land  | Weather Reanalysis
# ECMWF      | Weather Forecast
# Sentinel-2 | Environmental Data


def main(args):
    # load mask vector
    df_mask = gpd.read_file(args["mask_path"])

    # dicover files
    files = [
        {
            "timestamp": file_path.stem,
            "variable": file_path.parent.name,
            "file_path": str(file_path),
            "file_name": parse_filename(file_path),
        }
        for file_path in Path(args["data_path"]).glob("**/*.tif")
    ]

    # process in parallel
    data = []
    with multiprocessing.Pool(processes=args["jobs"]) as pool:
        # spawn tasks
        task_fun = partial(
            derive_statistics, mask=args["mask_path"], reproject=args["reproject"]
        )
        tasks = pool.imap_unordered(task_fun, files)

        # collect results
        for zonal_data in (pbar := tqdm(tasks, total=len(files))):
            pbar.set_description_str(zonal_data["file_name"])

            # parse gdal zonal statistics csv
            df_stats = pd.read_csv(StringIO(zonal_data["csv_data"]))
            df_stats = df_stats.assign(
                timestamp=zonal_data["timestamp"],
                variable=zonal_data["variable"],
                hash=df_mask["hash"],
            )

            data.append(df_stats)

    # save data
    df = pd.concat(data, ignore_index=True)
    print(df.head())

    df.to_csv(args["output_path"], index=None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reproject", action="store_true")
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument(
        "--data-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/environmental",
    )
    parser.add_argument(
        "--mask-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/area-of-interest/bogor-extent.geojson",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/attributes/zonal-stats.csv",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

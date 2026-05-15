import re
import sqlite3
import argparse
import subprocess
import multiprocessing
from typing import TypedDict
from pathlib import Path
from functools import partial

from tqdm import tqdm
from rich import print


class RenderResult(TypedDict):
    success: bool
    timestamp: str
    file_name: str
    raster_data: bytes


# ------------------------------------------------------
# Functions
# ------------------------------------------------------


def parse_filename(p: Path) -> str:
    return str(p.relative_to(p.parent.parent))


def parse_timestamp(s: str):
    ts = re.search(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})", s)
    return f"{ts.group(1)}-{ts.group(2)}-{ts.group(3)} {ts.group(4)}:{ts.group(5)}:{ts.group(6)}"


def get_color_ramp(var_name: str):
    return "/mnt/data/workspace/bogor-agrisat/data/color-palette/spectral.txt"


def extract_raster_data(path: str, color_ramp_path: str) -> bytes:
    result = subprocess.run([
        "gdal", "raster", "pipeline",
        # read input raster
        "read", path, "!",
        # reproject to Web Mercator (3857)
        "reproject", "--dst-crs=EPSG:3857", "!",
        # render color map
        "color-map", "--band", "1", "--color-map", color_ramp_path, "--add-alpha", "!",
        # write to stdout
        "write", "--of", "WEBP", "--overwrite", "/vsistdout/"
    ], capture_output=True)  # fmt: skip

    if result.returncode != 0 and len(result.stdout) == 0:
        print(result.stderr)
        return None

    return result.stdout


# ------------------------------------------------------
# Data Loading
# ------------------------------------------------------


def single_process(raster_path: Path, color_ramp_path: str) -> RenderResult:
    file_name = parse_filename(raster_path)
    timestamp = parse_timestamp(raster_path.name)
    raster_data = extract_raster_data(raster_path, color_ramp_path)

    if raster_data is None:
        return {
            "success": False,
            "timestamp": timestamp,
            "file_name": file_name,
            "raster_data": None,
        }

    return {
        "success": True,
        "timestamp": timestamp,
        "file_name": file_name,
        "raster_data": raster_data,
    }


def load_data(db: sqlite3.Connection, var_path: Path):
    cursor = db.cursor()

    # load existing data to not process the same file again
    cursor.execute("SELECT file_name FROM zonal_raster")
    resultset = cursor.fetchall()
    loaded_files = [x[0] for x in resultset]

    # load variable mapping
    cursor.execute("SELECT id, key FROM variables")
    resultset = cursor.fetchall()
    variable_id_map = {k[1]: k[0] for k in resultset}

    # run params
    var_name = var_path.name
    variable_id = variable_id_map[var_name]
    color_ramp = get_color_ramp(var_name)

    # discover files
    files = [x for x in var_path.glob("*.tif") if parse_filename(x) not in loaded_files]

    # process in parallel
    data = []
    with multiprocessing.Pool(processes=args["jobs"]) as pool:
        # spawn tasks
        task_fun = partial(single_process, color_ramp_path=color_ramp)
        tasks = pool.imap_unordered(task_fun, files)

        # collect results
        for result in (pbar := tqdm(tasks, total=len(files))):
            pbar.set_description_str(result["file_name"])

            if not result["success"]:
                print(f"Failed to process: {result['file_name']}")
                continue

            data.append(
                (
                    variable_id,
                    result["timestamp"],
                    result["file_name"],
                    result["raster_data"],
                )
            )

    # save to DB
    cursor.executemany(
        """
        INSERT INTO zonal_raster (variable_id, timestamp, file_name, raster_data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (variable_id, timestamp) DO NOTHING
        """,
        data,
    )
    db.commit()


# ------------------------------------------------------
# Main Entry
# ------------------------------------------------------


def main(args):
    root_dir = Path(args["data_dir"])
    con = sqlite3.connect(args["db"])

    print("Discovering variables...")
    var_paths = list(root_dir.glob("*"))

    print("Processing...")
    for path in (pbar := tqdm(var_paths)):
        pbar.set_description_str(path.name)
        load_data(con, path)

    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument(
        "--db",
        type=str,
        default="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/data.db",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/environmental",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

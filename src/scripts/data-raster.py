import re
import sqlite3
import pathlib
import argparse
import subprocess

from tqdm import tqdm
from rich import print

# ------------------------------------------------------
# Transactional
# ------------------------------------------------------

ZONAL_RASTER_SQL = """
INSERT INTO zonal_raster (variable_id, timestamp, file_name, raster_data)
VALUES (?, ?, ?, ?)
ON CONFLICT (variable_id, timestamp) DO NOTHING
"""


def parse_timestamp(s: str):
    ts = re.search(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})", s)
    return f"{ts.group(1)}-{ts.group(2)}-{ts.group(3)} {ts.group(4)}:{ts.group(5)}:{ts.group(6)}"


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


def get_color_ramp(var_name: str):
    return "/mnt/data/workspace/bogor-agrisat/data/production-data/environmental/ndvi/greens.txt"


def get_file_name(p: pathlib.Path) -> str:
    return str(p.relative_to(p.parent.parent))


def load_data(db: sqlite3.Connection, var_path: pathlib.Path):
    cursor = db.cursor()

    # discover files
    files = list(var_path.glob("*.tif"))
    var_name = var_path.name
    color_ramp = get_color_ramp(var_name)

    # load existing data to not process the same file again
    cursor.execute("SELECT file_name FROM zonal_raster")
    resultset = cursor.fetchall()
    loaded_files = [x[0] for x in resultset]

    # load variable mapping
    cursor.execute("SELECT id, key FROM variables")
    resultset = cursor.fetchall()
    variable_id_map = {k[1]: k[0] for k in resultset}

    data = []
    for raster_path in tqdm(files):
        file_name = str(raster_path.relative_to(raster_path.parent.parent))
        if file_name in loaded_files:
            continue

        variable_id = variable_id_map[var_name]
        timestamp = parse_timestamp(raster_path.name)
        raster_data = extract_raster_data(raster_path, color_ramp)

        if raster_data is None:
            print(f"Failed to process: {raster_path.name}")
            continue

        data.append((variable_id, timestamp, file_name, raster_data))

    cursor.executemany(ZONAL_RASTER_SQL, data)
    db.commit()


# ------------------------------------------------------
# Main Entry
# ------------------------------------------------------


def main(args):
    root_dir = pathlib.Path(args["data_dir"])
    con = sqlite3.connect(args["db"])

    print("Discovering variables...")
    var_paths = list(root_dir.glob("*"))

    for path in tqdm(var_paths):
        if path.name != "ndvi":
            continue

        print(f"Loading: {path.name}")
        load_data(con, path)

    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        type=str,
        default="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/data.db",
    )
    parser.add_argument(
        "--data_dir",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/environmental",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

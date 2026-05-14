import argparse
import subprocess
from pathlib import Path
from typing import TypedDict, Literal

from tqdm import tqdm
from rich import print

import pandas as pd

# ------------------------------------------------
# Typings
# ------------------------------------------------

AVAILABLE_BANDS = [
    # "B01_60m",
    "B02_10m",
    "B03_10m",
    "B04_10m",
    "B05_20m",
    "B06_20m",
    "B07_20m",
    "B08_10m",
    # "B8A_20m",
    "B11_20m",
    "B12_20m",
    "SCL_20m",
]

VARIABLE_BAND_MAP = {
    # "Aerosol": "B01_60m",
    "Blue": "B02_10m",
    "Green": "B03_10m",
    "Red": "B04_10m",
    "RE1": "B05_20m",
    "RE2": "B06_20m",
    "RE3": "B07_20m",
    "NIR": "B08_10m",
    # "NarrowNIR": "B8A_20m",
    "SWIR1": "B11_20m",
    "SWIR2": "B12_20m",
    "SCL": "SCL_20m",
}


ALL_FEATURES = {
    # --- True color
    "TRUE_COLOR",
    # --- Vegetation index
    "NDVI",
    "GNDVI",
    # "EVI",
    "WDRVI",
    "MSAVI",
    # --- Chlorophyll index
    "NDRE",
    # "TCARI/OSAVI",
    "CIRE",
    # --- Water stress index
    "NDMI",
    # "NMDI",
    "NDWI",
}


type FEATURE_TYPE = Literal[
    # True color
    "TRUE_COLOR",
    # Vegetation index
    "NDVI", "GNDVI", "EVI", "WDRVI", "MSAVI",
    # Chlorophyll index
    "NDRE", "TCARI/OSAVI", "CIRE",
    # Water stress index
    "NDMI", "NMDI", "NDWI"
]  # fmt: skip


class SentinelDataset(TypedDict):
    mission_id: str
    product_level: str
    sensing_ts: str
    processing_baseline_num: str
    relative_orbit_num: str
    tile_num: str
    product_ts: str


# ------------------------------------------------
# Methods
# ------------------------------------------------


def parse_dataset_name(s: str) -> SentinelDataset:
    # S2A_MSIL2A_20260331T030201_N0512_R032_T48MXT_20260331T112509.SAFE
    parts = s[:-5].split("_")
    return {
        "mission_id": parts[0],
        "product_level": parts[1],
        "sensing_ts": parts[2],
        "processing_baseline_num": parts[3],
        "relative_orbit_num": parts[4],
        "tile_num": parts[5],
        "product_ts": parts[6],
    }


def discover_files(path: Path) -> pd.DataFrame:
    print("Discovering files...")

    bands_data = []
    for file_path in path.glob("**/*.jp2"):
        for band_name in AVAILABLE_BANDS:
            if band_name not in file_path.name:
                continue

            dataset_dir_name = file_path.parents[4].name
            bands_data.append(
                {
                    **parse_dataset_name(dataset_dir_name),
                    "band": band_name,
                    "file_path": file_path,
                }
            )

    return pd.DataFrame(bands_data)


# ------------------------------------------------
# Data Derivation
# ------------------------------------------------


def derive_feature(type: FEATURE_TYPE, raster_root: Path, mask: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)

    # special mode for true color by combining RGB bands
    if type == "TRUE_COLOR":
        final_cmd = [
            "gdal", "pipeline",
            # stack RGB bands then average
            "stack",
            raster_root / 'B04_10m.vrt', # R
            raster_root / 'B03_10m.vrt', # G
            raster_root / 'B02_10m.vrt', # B
            "!",
            # clip by mask polygon
            "clip", "--like", mask, "!",
            # write to file
            "write", dest,
            "--overwrite",
            "--co", "PREDICTOR=2", "--co", "COMPRESS=DEFLATE"
        ]  # fmt: skip

        subprocess.run(final_cmd, capture_output=True, text=True)
        return

    # raster calculator arguments
    formula = ""

    # Vegetation index
    if type == "NDVI":
        formula = "(NIR - Red) / (NIR + Red)"
    elif type == "GNDVI":
        formula = "(NIR - Green) / (NIR + Green)"
    elif type == "EVI":
        formula = "2.5 * (NIR - Red) / (NIR + 6.0 * Red - 7.5 * Aerosol + 1.0)"
    elif type == "WDRVI":
        formula = "(0.1 * NIR - Red) / (0.1 * NIR + Red)"
    elif type == "MSAVI":
        formula = "0.5 * (2 * NIR + 1 - sqrt((2 * NIR + 1)^2 - 8 * (NIR - Red)))"

        # Chlorophyll index
    elif type == "CIRE":
        formula = "(RE3 / RE1) - 1"
    elif type == "NDRE":
        formula = "(NIR - RE2) / (NIR + RE2)"
    elif type == "TCARI/OSAVI":
        formula = (
            "(3 * (RE1 - Red) - 0.2 * (RE1 - Green) * (RE1 / Red)) / "  # TCARI
            + "((1 + 0.16) * (RE3 - Red) / (RE3 + Red + 0.16))"  # OSAVI
        )

        # Water stress index
    elif type == "NDMI":
        formula = "(NIR - SWIR1) / (NIR + SWIR1)"
    elif type == "NMDI":
        formula = "(NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))"
    elif type == "NDWI":
        formula = "(Green - NIR) / (Green + NIR)"
    else:
        raise ValueError("Invalid type!")

    # file inputs
    input_files = []
    for band, file_name in VARIABLE_BAND_MAP.items():
        if band in formula:
            input_files.append("-i")
            input_files.append(f"{band}={raster_root}/{file_name}.vrt")

    # execute calculation
    final_cmd = [
        # start pipeline
        "gdal", "pipeline", 
        # derive feature
        "calc", 
        *input_files,
        "--calc", formula,
        "--propagate-nodata", "!",
        # clip by mask polygon
        "clip", "--like", mask, "!",
        # set type
        "set-type", "--datatype", "Float32", "!",
        # write to file
        "write", dest, 
        "--overwrite",
        "--co", "PREDICTOR=2", "--co", "COMPRESS=DEFLATE"
    ]  # fmt: skip

    subprocess.run(final_cmd, capture_output=True, text=True)


def create_virtual_layer(sources: list[Path], dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "gdalbuildvrt",
            "-resolution",
            "average",
            dest,
            *sources,
        ],
        capture_output=True,
        text=True,
    )


# ------------------------------------------------
# Entry Point
# ------------------------------------------------


def main(args: dict[str, str | int]):
    root_path = Path(args["data_path"])
    virt_path = Path(args["data_path"]) / "virtual"
    prod_path = Path(args["output_path"])
    mask_path = Path(args["mask_path"])

    # discover files
    df_bands = discover_files(root_path)

    # get unique sensing TS
    unique_ts = df_bands["product_ts"].unique()
    print(f"Detected {len(unique_ts)} timestamps")

    # process each timestamp
    for current_ts in (tbar := tqdm(unique_ts, desc="Time slice")):
        ts_path = virt_path / current_ts
        tbar.set_postfix_str(f"{current_ts}")

        # create virtual layers
        for band in (pbar := tqdm(AVAILABLE_BANDS, leave=False, desc="Building VRT")):
            pbar.set_postfix_str(band)

            df_subset = df_bands[
                (df_bands["product_ts"] == current_ts) & (df_bands["band"] == band)
            ]

            if df_subset.shape[0] != 4:
                print(f"Band {band} does not have 4 raster! TS: {current_ts}")
                continue

            file_paths = df_subset["file_path"].tolist()
            target_path = ts_path / f"{band}.vrt"

            if target_path.exists():
                continue

            create_virtual_layer(file_paths, target_path)

        # derive final features
        for feature in (
            pbar := tqdm(ALL_FEATURES, leave=False, desc="Deriving features")
        ):
            pbar.set_postfix_str(feature)

            target_path = (
                prod_path
                / "environmental"
                / feature.lower().replace("_", "-").replace("/", "_")
                / f"{current_ts}.tif"
            )

            if target_path.exists():
                continue

            derive_feature(feature, ts_path, mask_path, target_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/sentinel-2",
    )
    parser.add_argument(
        "--mask-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/area-of-interest/bogor-extent.geojson",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

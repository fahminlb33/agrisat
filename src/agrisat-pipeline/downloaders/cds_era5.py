import json
import time
import random
import shutil
import zipfile
import calendar
import subprocess
from pathlib import Path

import cdsapi

import xarray as xr
import geopandas as gpd

from prefect import flow, task
from prefect.futures import wait
from prefect.logging import get_run_logger
from prefect.blocks.core import Block
from prefect.blocks.system import Secret
from prefect.artifacts import create_progress_artifact, update_progress_artifact

# ------------------------------------------------
# Tasks
# ------------------------------------------------

@task
def download():
    days_in_month = calendar.monthrange(year, month)[1]
    days_list = [f"{x:02d}" for x in range(1, days_in_month + 1)]
    time_list = [f"{x:02d}:00" for x in range(1, 24)]

    bbox_transform = [
        self.bbox[1],
        self.bbox[0],
        self.bbox[3],
        self.bbox[2],
    ]

    dataset = "reanalysis-era5-single-levels"
    request = {
        "product_type": ["reanalysis"],
        "variable": [
            "2m_temperature",
            "total_precipitation",
            "total_cloud_cover",
            "precipitation_type",
        ],
        "year": [f"{year}"],
        "month": [f"{month}"],
        "day": days_list,
        "time": time_list,
        "area": bbox_transform,
        "data_format": "netcdf",
        "download_format": "zip",
    }

    client.retrieve(dataset, request, download_path)

@task
def preprocess(download_path: str, extract_path: str):
    # extract ZIP
    with zipfile.ZipFile(download_path, "r") as zip_ref:
        zip_ref.extractall(extract_path)

    # find all datasets
    extracted_path = Path(extract_path)
    for file_path in extracted_path.glob("*.nc"):
        # open dataset
        ds = xr.open_dataset(file_path, engine="netcdf4")

        # process each variables
        for variable in (pv := tqdm(list(ds.data_vars.keys()), position=0)):
            if variable not in ["t2m", "tp", "tcc", "ptype"]:
                continue

            pv.set_description_str(variable)

            target_path = Path(self.root_path) / variable
            target_path.mkdir(parents=True, exist_ok=True)

            # save each timestamp
            for item in (pt := tqdm(ds[variable], position=1)):
                ts = item["valid_time"].values.astype("datetime64[us]").item()
                ts = ts.strftime("%Y%m%dT%H%M%S")
                pt.set_description_str(ts)

                item.rio.to_raster(target_path / f"{ts}.tif")

    # delete extracted
    shutil.rmtree(extracted_path, True)

# ------------------------------------------------
# Flow
# ------------------------------------------------

@flow
def download_era5_data(download_root: str, time_range: str, bbox_str: str):
    self.bbox = bbox  # bbox is unused
    self.time_range = time_range  # time range must be single date

    self.client = cdsapi.Client()
    self.root_path = Path(download_root) / "era5-land"

    parts = self.time_range.split("-")
    year = int(parts[0])
    month = int(parts[1])

    download_path = self.root_path / f"{year:02d}{month:02d}.zip"
    extract_path = self.root_path / f"{year:02d}{month:02d}"

    if not download_path.exists():
        download(year, month, download_path)

    preprocess(download_path, extract_path)

# ------------------------------------------------
# Entry Point
# ------------------------------------------------

if __name__ == "__main__":
    download_era5_data.serve(name="download-era5")

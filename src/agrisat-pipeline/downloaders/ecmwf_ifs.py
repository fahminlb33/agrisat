import json
import time
import random
import subprocess
from pathlib import Path
from datetime import datetime

from ecmwf.opendata import Client as ECMWFClient

import xarray as xr
import geopandas as gpd


from prefect import flow, task
from prefect.futures import wait
from prefect.logging import get_run_logger
from prefect.blocks.core import Block
from prefect.blocks.system import Secret
from prefect.artifacts import create_progress_artifact, update_progress_artifact

# to store the correct bands and timestamps
# we follow the variable names from ERA5
BAND_NAMES = {
    "Temperature": "t2m",
    "subcat 192": "tcc",
    "subcat 193": "tp",
    "Precipitation type": "ptype",
}

# ------------------------------------------------
# Tasks
# ------------------------------------------------


@task
def download(time_step: int, time_range: list[int], download_path: str):
    logger = get_run_logger()
    client = ECMWFClient(source="ecmwf")

    logger.info("Starting download from ECMWF High-Resolution Forecast")
    client.retrieve(
        type="fc",
        time=0,  # GMT/UTC 00.00
        step=time_step,
        date=time_range,
        param=["2t", "tp", "tcc", "ptype"],
        target=download_path,
    )
    
    logger.info("Finished download from ECMWF")


@task
def __extract_band(download_path: str, band_num: int, band_name: str, timestamp: str):
    logger = get_run_logger()
    cmd_final = [
        "gdal_translate",
        "-b",
        f"{band_num}",
        "-of",
        "GTiff",
        download_path,
        self.root_path / band_name / f"{timestamp}.tif",
    ]

    logger.debug("Executing command: " + " ".join(cmd_final))

    result = subprocess.run(cmd_final, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("GDAL command returned a non-zero exit code")
        logger.error("Standard Error:\n" + result.stderr)
        logger.error("Standard Output:\n" + result.stdout)


@task
def preprocess(download_path: str):
    # extract metadata
    args = ["gdalinfo", "-json", download_path]
    result = subprocess.run(args, capture_output=True, text=True)
    data = json.loads(result.stdout)

    # create target dirs
    for band_name in self.BAND_NAMES.values():
        target_path = self.root_path / band_name
        target_path.mkdir(parents=True, exist_ok=True)

    # extract bands
    for band in data["bands"]:
        band_num = band["band"]
        band_comment = band["metadata"][""]["GRIB_COMMENT"]
        valid_time = int(band["metadata"][""]["GRIB_VALID_TIME"])
        ts = datetime.fromtimestamp(valid_time).strftime("%Y%m%dT%H%M%S")

        # match this band to predefined var
        match_key = next((x for x in self.BAND_NAMES.keys() if x in band_comment), None)

        if not match_key:
            continue

        self.__extract_band(download_path, band_num, self.BAND_NAMES[match_key], ts)


# ------------------------------------------------
# Flow
# ------------------------------------------------


@flow
def download_ecmwf_data(download_root: str, time_range: str, bbox_str: str):
    self.ENV = dotenv_values()

    self.bbox = bbox  # bbox is unused
    self.time_range = time_range  # time range must be single date

    self.root_path = Path(download_root) / "ecmwf"

    # Forecast horizon: 144 hours = 6 days, 72 hours = 3 days
    # 0 to 144 with 3 hours step
    for time_step in trange(0, 72, 3):
        # download prediction
        download_path = self.root_path / f"{self.time_range}-h{time_step}.grib2"
        if not download_path.exists():
            download()

        # extract GRIB2 to GeoTIFF
        self.__preprocess(download_path)
        time.sleep(random.random() * 10)


# ------------------------------------------------
# Entry Point
# ------------------------------------------------

if __name__ == "__main__":
    download_ecmwf_data.serve(name="download-era5")

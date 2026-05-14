import json
import time
import random
import shutil
import zipfile
import argparse
import calendar
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from datetime import datetime

from tqdm import tqdm, trange
from rich import print
from dotenv import dotenv_values

import httpx
import boto3
import cdsapi
import pystac_client
from ecmwf.opendata import Client as ECMWFClient

import xarray as xr
import geopandas as gpd


# ------------------------------------------------
# Types
# ------------------------------------------------

CDSE_SENTINEL_2_BANDS = [
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


class BaseContext(ABC):
    @abstractmethod
    def execute(self):
        pass


# ------------------------------------------------
# Processors
# ------------------------------------------------


class Sentinel2Context(BaseContext):
    def __init__(self, download_root: str, time_range: str, bbox: list[float]):
        self.ENV = dotenv_values()

        self.bbox = bbox
        self.time_range = time_range

        self.root_path = Path(download_root) / "sentinel-2"
        self.client = httpx.Client()
        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.ENV["CDSE_S3_ENDPOINT"],
            aws_access_key_id=self.ENV["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=self.ENV["AWS_SECRET_ACCESS_KEY"],
            region_name="default",
        )

    def execute(self):
        print("Opening STAC catalogue...")
        catalogue = pystac_client.Client.open(self.ENV["CDSE_STAC_ENDPOINT"])

        print("Searching STAC catalogue...")
        collection = catalogue.search(
            collections=["sentinel-2-l2a"], bbox=self.bbox, datetime=self.time_range
        )

        catalogue_items = collection.item_collection()
        print(f"Found {len(catalogue_items)} items.")

        df = gpd.GeoDataFrame.from_features(catalogue_items.to_dict(), crs="epsg:4326")
        print(df.head(2))

        for i, item in enumerate(catalogue_items):
            print(f"====> DOWNLOADING: {i} - {item.id}")

            for band in CDSE_SENTINEL_2_BANDS:
                print(f"Downloading: {band}")
                self.download(item, band)

    def download(self, catalogue, band: str):
        band_url = catalogue.assets[band].href
        band_save_path = catalogue.assets[band].extra_fields["file:local_path"]
        self.__download_s3(band_url, band_save_path)

        thumbnail_url = catalogue.assets["thumbnail"].href
        thumbnail_save_path = catalogue.assets["thumbnail"].extra_fields[
            "file:local_path"
        ]
        self.__download_http(thumbnail_url, thumbnail_save_path)

    def __download_s3(self, url: str, save_path: str):
        bucket_name = url.split("/")[2]
        object_key = url[12:]

        real_save_path: Path = self.root_path / save_path
        real_save_path.parent.mkdir(parents=True, exist_ok=True)

        if real_save_path.exists():
            print("File already cached.")
            return

        response = self.s3.head_object(Bucket=bucket_name, Key=object_key)
        total_size = response["ContentLength"]

        with tqdm(total=total_size, unit="B", unit_scale=True) as pbar:
            self.s3.download_file(
                Bucket=bucket_name,
                Key=object_key,
                Filename=real_save_path,
                Callback=lambda bytes_transferred: pbar.update(bytes_transferred),
            )

    def __download_http(self, url: str, save_path: str):
        real_save_path: Path = self.root_path / save_path
        real_save_path.parent.mkdir(parents=True, exist_ok=True)

        if real_save_path.exists():
            print("File already cached.")
            return

        with self.client.stream("GET", url, follow_redirects=True) as response:
            total_size = int(response.headers.get("Content-Length", 0))

            with real_save_path.open("wb") as file:
                with tqdm(total=total_size, unit="B", unit_scale=True) as progress:
                    for chunk in response.iter_bytes():
                        file.write(chunk)
                        progress.update(len(chunk))


class ERA5LandContext(BaseContext):
    def __init__(self, download_root: str, time_range: str, bbox: list[float]):
        self.ENV = dotenv_values()

        self.bbox = bbox  # bbox is unused
        self.time_range = time_range  # time range must be single date

        self.client = cdsapi.Client()
        self.root_path = Path(download_root) / "era5-land"

    def execute(self):
        parts = self.time_range.split("-")
        year = int(parts[0])
        month = int(parts[1])

        download_path = self.root_path / f"{year:02d}{month:02d}.zip"
        extract_path = self.root_path / f"{year:02d}{month:02d}"

        if not download_path.exists():
            self.__download(year, month, download_path)

        self.__extract_all(download_path, extract_path)

    def __download(self, year: int, month: int, download_path: str):
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

        self.client.retrieve(dataset, request, download_path)

    def __extract_all(self, download_path: str, extract_path: str):
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


class ECMWFContext(BaseContext):
    # to store the correct bands and timestamps
    # we follow the variable names from ERA5
    BAND_NAMES = {
        "Temperature": "t2m",
        "subcat 192": "tcc",
        "subcat 193": "tp",
        "Precipitation type": "ptype",
    }

    def __init__(self, download_root: str, time_range: str, bbox: list[float]):
        self.ENV = dotenv_values()

        self.bbox = bbox  # bbox is unused
        self.time_range = time_range  # time range must be single date

        self.client = ECMWFClient(source="ecmwf")
        self.root_path = Path(download_root) / "ecmwf"

    def execute(self):
        # Forecast horizon: 144 hours = 6 days, 72 hours = 3 days
        # 0 to 144 with 3 hours step
        for time_step in trange(0, 72, 3):
            # download prediction
            download_path = self.root_path / f"{self.time_range}-h{time_step}.grib2"
            if not download_path.exists():
                self.client.retrieve(
                    type="fc",
                    time=0,  # GMT/UTC 00.00
                    step=time_step,
                    date=self.time_range,
                    param=["2t", "tp", "tcc", "ptype"],
                    target=download_path,
                )

            # extract GRIB2 to GeoTIFF
            self.__preprocess(download_path)
            time.sleep(random.random() * 10)

    def __preprocess(self, download_path: str):
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
            match_key = next(
                (x for x in self.BAND_NAMES.keys() if x in band_comment), None
            )

            if not match_key:
                continue

            self.__extract_band(download_path, band_num, self.BAND_NAMES[match_key], ts)

    def __extract_band(
        self, download_path: str, band_num: int, band_name: str, timestamp: str
    ):
        cmd_final = [
            "gdal_translate",
            "-b",
            f"{band_num}",
            "-of",
            "GTiff",
            download_path,
            self.root_path / band_name / f"{timestamp}.tif",
        ]

        result = subprocess.run(cmd_final, capture_output=True, text=True)
        if result.returncode != 0:
            print("--------------------------------------------------")
            print("An error has occured when running gdal_translate!")
            print("STDOUT", result.stdout)
            print("STDERR", result.stderr)
            print("--------------------------------------------------")


# ------------------------------------------------
# Entry Point
# ------------------------------------------------


def main(args):
    time_range = args["temporal_extent"]
    bbox = list(map(float, args["spatial_extent"].split(",")))

    print(f"Temporal extent: {time_range}")
    print(f"Spatial extent: {bbox}")

    cls = None
    if args["source"] == "sentinel-2":
        cls = Sentinel2Context
    elif args["source"] == "era5-land":
        cls = ERA5LandContext
    elif args["source"] == "ecmwf-fc":
        cls = ECMWFContext
    else:
        raise ValueError("Unknown downloader!")

    cls(download_root=args["download_path"], time_range=time_range, bbox=bbox).execute()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "source", type=str, choices=["sentinel-2", "era5-land", "ecmwf-fc"]
    )

    parser.add_argument("--temporal-extent", type=str, default="2026-01-01/2026-04-20")
    parser.add_argument("--spatial-extent", type=str, default="106.4,-6.8,107.2,-6.3")
    parser.add_argument(
        "--download-path", type=str, default="/mnt/data/workspace/bogor-agrisat/data"
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)

from typing import TypedDict
from pathlib import Path

import httpx
import boto3
import pystac_client

from prefect import flow, task
from prefect.futures import wait
from prefect.logging import get_run_logger
from prefect.blocks.core import Block
from prefect.blocks.system import Secret
from prefect.artifacts import create_progress_artifact, update_progress_artifact


class CDSEConfig(Block):
    cdse_stac_endpoint: str
    cdse_s3_endpoint: str
    cdse_s3_access_key: Secret
    cdse_s3_secret_key: Secret


class CatalogueItem(TypedDict):
    name: str
    band_url: str
    band_save_path: str
    thumbnail_url: str
    thumbnail_save_path: str


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

# ------------------------------------------------
# Functions
# ------------------------------------------------

class S3Progress:
    def __init__(self, total_size: float):
        self.total_size = max(float(total_size), -1)
        self.total_transferred = 0
        self.progress_artifact_id = create_progress_artifact(
            progress=0.0,
            description="S3 download",
        )

    def __call__(self, bytes_transferred: float):
        self.total_transferred += bytes_transferred
        update_progress_artifact(
            artifact_id=self.progress_artifact_id,
            progress=self.total_transferred / self.total_size * 100,
        )

@task(tags=["sentinel-2"])
def download_s3(url: str, root_path: Path, save_path: str):
    logger = get_run_logger()
    config = CDSEConfig.load("agrisat-cdse")
    s3_client = boto3.client(
        "s3",
        endpoint_url=config.cdse_s3_endpoint,
        aws_access_key_id=config.cdse_s3_access_key.get(),
        aws_secret_access_key=config.cdse_s3_secret_key.get(),
        region_name="default",
    )

    bucket_name = url.split("/")[2]
    object_key = url[12:]

    real_save_path = root_path / save_path
    real_save_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Download from: {url}")
    logger.info(f"Saving to: {str(real_save_path)}")

    if real_save_path.exists():
        logger.info("File already cached")
        return

    response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
    progress = S3Progress(response["ContentLength"])

    s3_client.download_file(
        Bucket=bucket_name,
        Key=object_key,
        Filename=real_save_path,
        Callback=progress,
    )

    logger.info("File downloaded from S3")


@task
def download_http(url: str, root_path: Path, save_path: str):
    logger = get_run_logger()

    real_save_path = root_path / save_path
    real_save_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Download from: {url}")
    logger.info(f"Saving to: {str(real_save_path)}")

    if real_save_path.exists():
        logger.info("File already cached")
        return

    with httpx.stream("GET", url, follow_redirects=True) as response:
        bytes_transferred = 0.0
        total_size = float(response.headers.get("Content-Length", -1))
        progress_artifact_id = create_progress_artifact(
            progress=0.0,
            description="HTTP download",
        )

        with real_save_path.open("wb") as file:
            for chunk in response.iter_bytes():
                file.write(chunk)
                bytes_transferred += len(chunk)

                update_progress_artifact(
                    artifact_id=progress_artifact_id,
                    progress=bytes_transferred / total_size * 100,
                )
        
    logger.info("File downloaded from HTTP")


# ------------------------------------------------
# Tasks
# ------------------------------------------------


@task
def fetch_catalogue(
    time_range: str, bbox: list[float]
) -> list[tuple[str, list[CatalogueItem]]]:
    logger = get_run_logger()
    config = CDSEConfig.load("agrisat-cdse")

    logger.info("Opening STAC catalogue...")
    catalogue = pystac_client.Client.open(config.cdse_stac_endpoint)

    logger.info("Searching STAC catalogue...")
    collection = catalogue.search(
        collections=["sentinel-2-l2a"], bbox=bbox, datetime=time_range
    )

    items = collection.item_collection()
    logger.info(f"Found {len(items)} items")

    entries = []
    for item in items:
        data = [
            {
                "name": item.assets[band].title,
                "band_url": item.assets[band].href,
                "band_save_path": item.assets[band].extra_fields["file:local_path"],
                "thumbnail_url": item.assets["thumbnail"].href,
                "thumbnail_save_path": item.assets["thumbnail"].extra_fields[
                    "file:local_path"
                ],
            }
            for band in CDSE_SENTINEL_2_BANDS
        ]

        entries.append((item.id, data))
        logger.info(f"Queued item: {item.id}")

    return entries


@task
def download(catalogue_item: CatalogueItem, root_path: Path) -> str:
    logger = get_run_logger()

    logger.info(f"Downloading band: {catalogue_item['name']}")

    download_http(
        catalogue_item["thumbnail_url"],
        root_path,
        catalogue_item["thumbnail_save_path"],
    )

    download_s3(catalogue_item["band_url"], root_path, catalogue_item["band_save_path"])

    logger.info("Finished downloading band")


# ------------------------------------------------
# Flow
# ------------------------------------------------


@flow
def download_sentinel_data(
    download_root: str, time_range: str, bbox_str: str
) -> list[str]:
    logger = get_run_logger()
    root_path = Path(download_root) / "sentinel-2"

    bbox = list(map(float, bbox_str.split(",")))
    items = fetch_catalogue(time_range, bbox)

    for item in items:
        logger.info(f"Processing catalogue: {item[0]}")

        tasks = [download.submit(x, root_path) for x in item[1]]
        logger.info(f"Queued {len(tasks)} tasks")
        
        wait(tasks)

        logger.info("Catalogue downloaded")


# ------------------------------------------------
# Entry Point
# ------------------------------------------------

if __name__ == "__main__":
    download_sentinel_data.serve(name="download-sentinel_2")

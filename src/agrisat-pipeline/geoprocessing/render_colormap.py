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


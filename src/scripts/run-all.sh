#!/usr/bin/env bash

# download dataset
uv run download.py sentinel-2 --temporal-extent --download-path /mnt/data/workspace/bogor-agrisat/data
uv run download.py era5-land --temporal-extent --download-path /mnt/data/workspace/bogor-agrisat/data
uv run download.py ecmwf-fc --temporal-extent --download-path /mnt/data/workspace/bogor-agrisat/data

# derive time series raster

# perform zonal statistics

# seed database if not exists

# sync database with zonal data


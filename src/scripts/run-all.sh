#!/usr/bin/env bash

DB_PATH="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/data.db"
SCHEMA_PATH="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/schema.sql"
DATA_ROOT="/mnt/data/workspace/bogor-agrisat/data"

SPATIAL_EXTENT="106.4,-6.8,107.2,-6.3"

# ==========================================================================
# Download dataset
# ==========================================================================

# Sentinel 2 L2A is downloaded by date range in daily resolution
uv run download.py sentinel-2 \
    --temporal-extent "2026-01-01/2026-04-20" \
    --spatial-extent "$SPATIAL_EXTENT" \
    --download-path "$DATA_ROOT"

# ECMWF data is downloaded by a single date
# 2026-05-01 will return this date +6 days of forecast
# automatically download yesterday prediction
uv run download.py ecmwf-fc \
    --temporal-extent "$(date -d yesterday +%F)" \
    --spatial-extent "$SPATIAL_EXTENT" \
    --download-path "$DATA_ROOT"

# ERA5 data is downloaded in monthly resolution
# 2026-01-01, 2026-02-01, etc.
uv run download.py era5-land \
    --temporal-extent 2026-01-01 \
    --spatial-extent "$SPATIAL_EXTENT" \
    --download-path "$DATA_ROOT"

# ==========================================================================
# Derive ready-to-view rasters from the dataset
# ==========================================================================

uv run derive-rasters.py \
    --data-path "$DATA_ROOT/sentinel-2" \
    --mask-path "$DATA_ROOT/production-data/area-of-interest/bogor-extent.geojson" \
    --output-path "$DATA_ROOT/production-data"

# ==========================================================================
# Derive zonal statistics for each zones
# ==========================================================================

ZONE_MASKS=("extent" "kecamatan" "kota" "sawah")

for current_zone in "${ZONE_MASKS[@]}"; do
    echo "Processing: $current_zone"

    uv run zonal-statistics.py \
        --data-path "$DATA_ROOT/production-data/environmental" \
        --mask-path "$DATA_ROOT/production-data/area-of-interest/bogor-$current_zone.geojson"  \
        --output-path "$DATA_ROOT/production-data/attributes/zonal_env-$current_zone.csv"

    uv run zonal-statistics.py \
        --reproject \
        --data-path "$DATA_ROOT/ecmwf" \
        --mask-path "$DATA_ROOT/production-data/area-of-interest/bogor-$current_zone.geojson"  \
        --output-path "$DATA_ROOT/production-data/attributes/zonal_weather_fc-$current_zone.csv"

    uv run zonal-statistics.py \
        --reproject \
        --data-path $DATA_ROOT/era5-land \
        --mask-path "$DATA_ROOT/production-data/area-of-interest/bogor-$current_zone.geojson"  \
        --output-path $DATA_ROOT/production-data/attributes/zonal_weather_re-$current_zone.csv
done

# ==========================================================================
# Create and update database
# ==========================================================================

# create database if not exists
uv run data-seed.py \
    --db "$DB_PATH" \
    --schema "$SCHEMA_PATH" \
    --zones "$DATA_ROOT/production-data/area-of-interest" \
    --variables "$DATA_ROOT/production-data/attributes/variables.xlsx"

# sync database with zonal statistics data
uv run data-sync.py \
    --db "$DB_PATH" \
    --data-dir "$DATA_ROOT/production-data/attributes"

# sync database with raster data
uv run data-raster.py \
    --db "$DB_PATH" \
    --data-dir "$DATA_ROOT/production-data/environmental"

from typing import Annotated
from sqlite3 import Connection
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Response, HTTPException, Depends, Query

from ..dependencies import get_db
from ..repository.layers import (
    list_levels,
    list_zones,
    list_variables,
    get_zone_polygon,
    get_raster,
)

router = APIRouter(prefix="/layers", tags=["Layers"])

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class GetLayerZones(BaseModel):
    level_id: Optional[int] = None


class GetLayerRequest(BaseModel):
    variable_id: int
    ts: datetime


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/levels")
async def api_list_levels(db: Annotated[Connection, Depends(get_db)]):
    return list_levels(db)


@router.get("/zones")
async def api_list_zones(
    db: Annotated[Connection, Depends(get_db)], query: Annotated[GetLayerZones, Query()]
):
    return list_zones(db, level_id=query.level_id)


@router.get("/variables")
async def api_list_variables(db: Annotated[Connection, Depends(get_db)]):
    return list_variables(db)


@router.get("/polygons")
async def api_get_polygons(
    db: Annotated[Connection, Depends(get_db)],
    level_id: int,
):
    geojson = get_zone_polygon(db, level_id=level_id)
    if geojson is None:
        raise HTTPException(status_code=404, detail="Polygon not found")

    return Response(
        content=geojson,
        media_type="application/geo+json",
        headers={"Content-Disposition": f"attachment; filename={level_id}.json"},
    )


@router.get("/rasters")
async def api_get_raster(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[GetLayerRequest, Query()],
):
    raster_data = get_raster(db, query.variable_id, query.ts)
    if raster_data is None:
        raise HTTPException(status_code=404, detail="Raster not found")

    return Response(
        content=raster_data.data_blob,
        media_type="image/webp",
        headers={
            "Agrisat-Variable": raster_data.variable_name,
            "Content-Disposition": f"attachment; filename={raster_data.file_name}",
        },
    )

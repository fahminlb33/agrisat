from typing import Annotated
from sqlite3 import Connection
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Response, HTTPException, Depends, Query

from ..dependencies import get_db
from ..repository.layers import (
    list_zones,
    list_zone_polygon,
    list_variables,
    list_indices,
    get_raster,
)

router = APIRouter(prefix="/layers", tags=["Layers"])

# ------------------------------------------------------
# Schemas
# ------------------------------------------------------


class GetLayerRasterRequest(BaseModel):
    variable_id: int
    ts: datetime


# ------------------------------------------------------
# API Endpoints
# ------------------------------------------------------


@router.get("/zones")
async def api_list_zones(db: Annotated[Connection, Depends(get_db)]):
    return list_zones(db)


@router.get("/variables")
async def api_list_variables(db: Annotated[Connection, Depends(get_db)]):
    return list_variables(db)


@router.get("/indices")
async def api_list_indices(db: Annotated[Connection, Depends(get_db)]):
    return list_indices(db)


@router.get("/rasters")
async def api_get_raster(
    db: Annotated[Connection, Depends(get_db)],
    query: Annotated[GetLayerRasterRequest, Query()],
):
    raster_data = get_raster(db, query.variable_id, query.ts)
    if raster_data is None:
        raise HTTPException(status_code=404, detail="Item not found")

    return Response(
        content=raster_data.data_blob,
        media_type="image/webp",
        headers={
            "Content-Disposition": f"attachment; filename={raster_data.file_name}"
        },
    )


@router.get("/polygons")
async def api_get_polygons(
    db: Annotated[Connection, Depends(get_db)],
    level: str,
):
    raster_data = list_zone_polygon(db, query.variable_id, query.ts)
    if raster_data is None:
        raise HTTPException(status_code=404, detail="Item not found")

    return Response(
        content=raster_data.data_blob,
        media_type="image/webp",
        headers={
            "Content-Disposition": f"attachment; filename={raster_data.file_name}"
        },
    )

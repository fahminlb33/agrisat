from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from .dependencies import get_current_user
from .routes.layers import router as layers_router
from .routes.weather import router as weather_router
from .routes.satellite import router as satellite_router
from .routes.environmental import router as environmental_router
from .routes.insights import router as insights_router

app = FastAPI(dependencies=[Depends(get_current_user)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(layers_router)
app.include_router(weather_router)
app.include_router(satellite_router)
app.include_router(environmental_router)
app.include_router(insights_router)

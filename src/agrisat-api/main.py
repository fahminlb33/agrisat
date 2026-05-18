from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.layers import router as layers_router
from .routes.weather import router as weather_router
from .routes.satellite import router as satellite_router
from .routes.environmental import router as environmental_router
from .routes.insights import router as insights_router

app = FastAPI(
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
    title="Skopos Neural Engine",
    version="1.0.0",
)

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


@app.get("/api")
def home():
    return "Hello from AgriSAT!"


@app.get("/api/health")
def health():
    return "OK"

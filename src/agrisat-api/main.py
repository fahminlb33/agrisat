from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

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


class CORSEverythingMiddleware(BaseHTTPMiddleware):
    """Custom CORS middleware that adds headers to ALL responses, including errors.

    FastAPI's built-in CORSMiddleware can fail to add headers when unhandled
    exceptions occur (e.g. 500s from dependency injection). This middleware
    wraps the entire call and ensures CORS headers are always present.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Handle preflight OPTIONS requests immediately
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

        try:
            response = await call_next(request)
        except Exception:
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error"},
            )

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response


app.add_middleware(CORSEverythingMiddleware)

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

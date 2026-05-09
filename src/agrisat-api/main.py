from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from .dependencies import get_current_user
from .routes.chat import router as chat_router
from .routes.layers import router as layers_router
from .routes.satellite import router as satellite_router
from .routes.statistics import router as statistics_router

app = FastAPI(dependencies=[Depends(get_current_user)])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(layers_router)
app.include_router(satellite_router)
app.include_router(statistics_router)

import os

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

from settings import Settings

settings = Settings()

app = get_fast_api_app(
    agents_dir=os.path.dirname(os.path.abspath(__file__)),
    session_service_uri=settings.agent_dsn,
    allow_origins=settings.allow_origins,
    web=settings.agent_web,
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

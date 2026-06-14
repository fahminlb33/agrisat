import os

import uvicorn

from dotenv import load_dotenv
from google.adk.cli.fast_api import get_fast_api_app

load_dotenv()

app = get_fast_api_app(
    agents_dir=os.path.dirname(os.path.abspath(__file__)),
    session_service_uri=os.environ.get(
        "AGENT_DSN", "sqlite+aiosqlite:///./sessions.db"
    ),
    allow_origins=["*"],
    web=True,
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

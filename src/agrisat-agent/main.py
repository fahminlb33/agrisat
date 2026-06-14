from dotenv import load_dotenv

load_dotenv()

import os
import uvicorn

from google.adk.cli.fast_api import get_fast_api_app

AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_URI = os.environ.get("AGENT_DSN", "sqlite+aiosqlite:///./sessions.db")

web_enabled = os.environ.get("AGENT_WEB", "false").lower() == "true"

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=SESSION_URI,
    allow_origins=["*"],
    web=web_enabled,
)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))

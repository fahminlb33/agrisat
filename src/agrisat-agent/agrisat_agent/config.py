"""
Agent configuration helpers.

Simple server-side config from environment variables.
BYOK / Ollama / LM Studio support will be added in a future iteration.
"""

import os

from google.adk.models import Gemini


def get_model():
    """Build the Gemini model from environment variables."""
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    return Gemini(model=model_name, api_key=api_key or None)

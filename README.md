# AgriSAT

> This project is still work-in-progress (WIP).
Visit the documentation [here](./docs/).

AgriSAT is a geospatial intelligence platform for precision agriculture.

## Getting Started

### Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [pnpm](https://pnpm.io/) (for the web frontend)

### Running the Backend (API)

```bash
# Install dependencies (first time or after changes)
uv sync

# Navigate to the API folder and run the dev server
cd src/agrisat-api
uv run fastapi dev
```

### Running the ADK Agent

```bash
# Install dependencies (first time or after changes)
uv sync

# Navigate to the agent source folder
cd src

# Option 1: Open the web debugging UI
uv run adk web

# Option 2: Serve the API only
uv run adk api_server
```

### Running the Frontend (Web)

```bash
cd src/agrisat-web
pnpm install
pnpm dev
```


## License

This project is licensed under the Apache License 2.0.
FROM python:3.13.12-slim-trixie

WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_DEV=1

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN groupadd --system --gid 999 nonroot && \
    useradd --system --gid 999 --uid 999 --create-home nonroot && \
    chown -R nonroot:nonroot /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    uv pip install --system -r requirements.txt

COPY . .

USER nonroot

EXPOSE 8000

CMD [ "uvicorn", "--host", "0.0.0.0", "--port", "8080", "app.main:app" ]

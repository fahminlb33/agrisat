# Base layer for with pnpm enabled
FROM node:24-slim AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Install dev dependencies & build server
FROM base AS build

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# Final production image
FROM base AS runner

COPY --from=build /app/.output /app/dist

USER node

EXPOSE 3000

ENTRYPOINT ["node", "/app/dist/server/index.mjs"]

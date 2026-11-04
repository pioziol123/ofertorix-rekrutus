FROM node:24.15.0-bookworm-slim AS base
RUN npm install --global pnpm@10.34.9
WORKDIR /app

FROM base AS development
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prepare
CMD ["pnpm", "dev"]

FROM development AS worker
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY integrations/jobspy /opt/jobspy-package
RUN cd /opt/jobspy-package && sha256sum --check wheel.sha256 \
    && python3 -m venv /opt/jobspy \
    && /opt/jobspy/bin/pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements.txt \
    && /opt/jobspy/bin/pip install --no-cache-dir --no-deps *.whl
CMD ["pnpm", "worker"]

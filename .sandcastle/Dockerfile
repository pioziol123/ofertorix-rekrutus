# Sandbox image for unattended agents: the project's toolchain, PostgreSQL with
# the schema migrated from the commit the image was built from, and Claude Code.
# Build from the repository root:
#   docker build -f .sandcastle/Dockerfile -t oferty-pracy-sandbox \
#     --build-arg AGENT_UID=$(id -u) --build-arg AGENT_GID=$(id -g) .
# Rebuild after pnpm-lock.yaml changes; new migrations are applied at test time.

FROM node:24.15.0-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
  git ca-certificates curl gnupg jq \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-18 \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.34.9

# Sandcastle runs the agent as a non-root "agent" user whose UID/GID match the
# host user, so files written to the bind-mounted worktree keep the host owner.
ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/usr/lib/postgresql/18/bin:/home/agent/.local/bin:$PATH" \
  PGDATA=/home/agent/pgdata \
  DATABASE_URL=postgresql://oferty@localhost:5432/oferty \
  NUXT_TELEMETRY_DISABLED=1 \
  CI=true \
  # A fixed store path: the worktree is a bind mount on another device, where
  # pnpm would otherwise look for a store at the mount root.
  npm_config_store_dir=/home/agent/.pnpm-store

# Warm the pnpm store so `pnpm install --offline` in the worktree is fast.
WORKDIR /home/agent/prefetch
COPY --chown=${AGENT_UID}:${AGENT_GID} package.json pnpm-lock.yaml .npmrc ./
RUN pnpm fetch

# Seed stage: a migrated database, built from this commit's code.
FROM base AS seed
WORKDIR /home/agent/seed
COPY --chown=${AGENT_UID}:${AGENT_GID} . .
RUN pnpm install --offline --frozen-lockfile \
  && initdb --username=oferty --auth=trust --encoding=UTF8 \
  && pg_ctl --wait --options="-k /tmp -c listen_addresses=localhost" --log=/tmp/pg.log start \
  && createdb --host=localhost --username=oferty oferty \
  && pnpm migrate \
  && pg_ctl --wait --mode=fast stop

FROM base
COPY --from=seed --chown=${AGENT_UID}:${AGENT_GID} /home/agent/pgdata /home/agent/pgdata
# COPY does not keep the mode; PostgreSQL refuses a data directory that is not 0700.
RUN chmod 700 /home/agent/pgdata
WORKDIR /home/agent
# Sandcastle bind-mounts the worktree at /home/agent/workspace.
ENTRYPOINT ["sleep", "infinity"]

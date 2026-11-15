#!/bin/sh
# docker compose for the isolated agent project, bound to the current worktree.
# The project "oferty-pracy-agent" has its own database and dependency volumes,
# separate from the owner's development stack. Usage: scripts/agent-compose.sh <compose args...>
set -eu
worktree=$(git rev-parse --show-toplevel)
main=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
WEB_PORT=${AGENT_WEB_PORT:-3199}
export WEB_PORT
exec docker compose \
  --project-name oferty-pracy-agent \
  --project-directory "$worktree" \
  --env-file "$main/.env" \
  --file "$worktree/compose.yaml" \
  "$@"

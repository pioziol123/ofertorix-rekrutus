#!/bin/sh
# Run one command in the tools service of the isolated agent project.
# Usage: scripts/agent-exec.sh <command> [args...]
set -eu
here=$(dirname "$0")
exec "$here/agent-compose.sh" run --rm --build --env CI=true tools "$@"

#!/bin/sh
# The full gate, run inside the agent sandbox image from a worktree root:
# dependencies, lint, typecheck, build and every test including integration.
set -eu
pnpm install --offline --frozen-lockfile
pnpm lint
pnpm typecheck
"$(dirname "$0")/test-integration.sh"

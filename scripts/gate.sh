#!/bin/sh
# The full gate, run inside the agent sandbox image from a worktree root:
# dependencies, formatting of the files the task changed, lint, typecheck,
# build and every test including integration.
set -eu
pnpm install --offline --frozen-lockfile
node "$(dirname "$0")/check-format.ts"
pnpm lint
pnpm typecheck
"$(dirname "$0")/test-integration.sh"

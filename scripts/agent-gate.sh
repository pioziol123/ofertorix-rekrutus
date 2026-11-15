#!/bin/sh
# Full gate for agent work: lint, typecheck, build and all tests, including
# integration tests against web and worker started from the current worktree.
set -eu
here=$(dirname "$0")
"$here/agent-exec.sh" sh -c 'pnpm install --frozen-lockfile && pnpm build'
"$here/agent-compose.sh" up --detach --wait --build web worker
status=0
"$here/agent-exec.sh" env RUN_INTEGRATION=1 pnpm check || status=$?
"$here/agent-compose.sh" stop web worker
exit "$status"

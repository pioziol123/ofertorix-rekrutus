/**
 * Sandcastle spike. Usage from the repository root:
 *   node .sandcastle/spike.ts probe   # sandbox checks, no agent, no token needed
 *   node .sandcastle/spike.ts agent   # one real agent run; needs CLAUDE_CODE_OAUTH_TOKEN in .sandcastle/.env
 */
import { execFileSync } from 'node:child_process'
import { claudeCode, createSandbox } from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'

const mode = process.argv[2] ?? 'probe'
const repoRoot = process.cwd()

function gitConfig(key: string): string {
  return execFileSync('git', ['config', key], { encoding: 'utf8' }).trim()
}

const branch = `agent/spike-${mode}-${Date.now()}`

await using sandbox = await createSandbox({
  branch,
  cwd: repoRoot,
  copyToWorktree: ['scripts/test-integration.sh'],
  sandbox: docker({
    imageName: 'oferty-pracy-sandbox',
    env: {
      GIT_AUTHOR_NAME: gitConfig('user.name'),
      GIT_AUTHOR_EMAIL: gitConfig('user.email'),
      GIT_COMMITTER_NAME: gitConfig('user.name'),
      GIT_COMMITTER_EMAIL: gitConfig('user.email'),
    },
  }),
})
console.log(`sandbox ${sandbox.sandboxId} on ${sandbox.branch}, worktree ${sandbox.worktreePath}`)

async function check(label: string, command: string): Promise<void> {
  const started = Date.now()
  const result = await sandbox.exec(command)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const out = `${result.stdout}${result.stderr}`.trim().split('\n').slice(-4).join('\n    ')
  console.log(`[${result.exitCode === 0 ? 'ok' : `exit ${result.exitCode}`}] ${label} (${seconds}s)\n    ${out}`)
}

if (mode === 'probe') {
  await check('install from warm store', 'pnpm install --offline --frozen-lockfile')
  await check('lint', 'pnpm lint')
  await check('typecheck', 'pnpm typecheck')
  await check('migrate, build, web, worker and all tests', 'scripts/test-integration.sh > /tmp/ti.log 2>&1; s=$?; sed "s/\\x1b\\[[0-9;]*m//g" /tmp/ti.log | grep -E "Test Files|Tests  |FAIL"; exit $s')
  await check('owner dev database unreachable', 'getent hosts db oferty-pracy-db-1 || echo not resolvable')
  await check('host docker socket hidden', 'ls /var/run/docker.sock 2>&1')
} else {
  const result = await sandbox.run({
    agent: claudeCode('claude-opus-5-5', { effort: 'medium' }),
    prompt: [
      'This is a sandbox smoke test. Do exactly this and nothing else:',
      '1. Run `pnpm install --offline --frozen-lockfile`, then `pnpm vitest run tests/companies.test.ts` and note whether it passed.',
      '2. Create docs/research/sandcastle-spike-probe.md with one line: "Written by an agent inside the Sandcastle docker sandbox." followed by the test result.',
      '3. Commit only that file with the message "spike: sandbox agent probe".',
      'When done, print <promise>COMPLETE</promise>.',
    ].join('\n'),
  })
  console.log({ completion: result.completionSignal, commits: result.commits, log: result.logFilePath })
  await check('branch log', 'git log --oneline -3')
}
console.log(`branch kept: ${branch}`)

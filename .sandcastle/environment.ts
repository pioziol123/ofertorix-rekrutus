/**
 * The real agent environments: Sandcastle docker sandboxes and the image they run on.
 * Kept apart from runner.ts so a check of a running environment uses the same setup.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { claudeCode, createSandbox } from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'
import { git, imageInputs } from './exchange.ts'
import type { FreshSandbox, Images, Sandboxes, WarmSandbox } from './ports.ts'

export const IMAGE = 'oferty-pracy-sandbox'
const IMAGE_LABEL = 'oferty-pracy.sandbox-inputs'
/**
 * Seconds an agent may go without a complete stream line before sandcastle fails the run.
 * The default 600 is too short: the CLI emits a line only once a whole message is done, so
 * a long think followed by a large Write of a new module shows up as one silent stretch.
 */
const AGENT_IDLE_TIMEOUT_SECONDS = 1800
/** Skills the agent uses inside the sandbox, mounted read-only from the host. */
const SKILLS = ['implement-task', 'tdd', 'write-documents']

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * The agent's environment (U2-R03): its worktree and the git data of the runner's copy,
 * the skills, and the commit identity. No GitHub credentials, no path of the owner's copy.
 * Sandcastle adds the variables from .sandcastle/.env, which holds only the agent token.
 */
export function sandboxProvider(repo: string) {
  const skillsRoot = join(homedir(), '.claude', 'skills')
  const mounts = SKILLS.filter((skill) => existsSync(join(skillsRoot, skill))).map((skill) => ({
    hostPath: realpathSync(join(skillsRoot, skill)),
    sandboxPath: `/home/agent/.claude/skills/${skill}`,
    readonly: true,
  }))
  const name = git(repo, ['config', 'user.name'])
  const email = git(repo, ['config', 'user.email'])
  return docker({
    imageName: IMAGE,
    mounts,
    env: { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email },
  })
}

export function dockerSandboxes({ repo, model, effort }: { repo: string; model: string; effort: Effort }): Sandboxes {
  const agent = () => claudeCode(model, { effort })
  return {
    async warm(branch): Promise<WarmSandbox> {
      const sandbox = await createSandbox({ branch, cwd: repo, sandbox: sandboxProvider(repo) })
      type Run = Awaited<ReturnType<typeof sandbox.run>>
      let run: Run | null = null
      return {
        worktreePath: sandbox.worktreePath,
        exec: (command) => sandbox.exec(command),
        async start(prompt) {
          run = await sandbox.run({ agent: agent(), prompt, idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS })
        },
        async resume(prompt) {
          if (!run?.resume) return false
          run = await run.resume(prompt, { idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS })
          return true
        },
        close: () => sandbox[Symbol.asyncDispose](),
      }
    },
    async fresh(branch): Promise<FreshSandbox> {
      const sandbox = await createSandbox({ branch, cwd: repo, sandbox: sandboxProvider(repo) })
      return {
        worktreePath: sandbox.worktreePath,
        exec: (command) => sandbox.exec(command),
        review: async (prompt) => {
          await sandbox.run({ agent: agent(), prompt, idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS })
        },
        close: () => sandbox[Symbol.asyncDispose](),
      }
    },
  }
}

/** Builds the image from the content of a fetched commit, not from the working files. */
export function dockerImages({ repo, log, rebuild }: { repo: string; log: (message: string) => void; rebuild: boolean }): Images {
  let force = rebuild
  return {
    ensure(commit) {
      const wanted = imageInputs(repo, commit)
      let current = ''
      try {
        current = execFileSync('docker', ['image', 'inspect', IMAGE, '--format', `{{ index .Config.Labels "${IMAGE_LABEL}" }}`], { encoding: 'utf8' }).trim()
      } catch {
        current = ''
      }
      if (current === wanted && !force) return
      force = false
      log(`building ${IMAGE} from ${commit.slice(0, 7)} (inputs ${wanted}, was ${current || 'none'})`)
      const uid = execFileSync('id', ['-u'], { encoding: 'utf8' }).trim()
      const gid = execFileSync('id', ['-g'], { encoding: 'utf8' }).trim()
      const archive = execFileSync('git', ['archive', '--format=tar', commit], { cwd: repo, maxBuffer: 1 << 30 })
      execFileSync(
        'docker',
        ['build', '-q', '-f', '.sandcastle/Dockerfile', '-t', IMAGE, '--label', `${IMAGE_LABEL}=${wanted}`,
          '--build-arg', `AGENT_UID=${uid}`, '--build-arg', `AGENT_GID=${gid}`, '-'],
        { input: archive, stdio: ['pipe', 'ignore', 'inherit'] },
      )
    },
  }
}

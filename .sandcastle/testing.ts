/**
 * Stand-ins for the runner's tests (solution design of oferty-pracy-uuk, T-02): a bare
 * repository plays the exchange point, clones play the runner's and the owner's copies,
 * and the task database, agents, gate, review, image build and notifications are fakes.
 * Git operations are real. No network is used.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { excludeAgentFiles, GATE, RESULT_FILE, REVIEW_DATABASE, REVIEW_FILE, type Runner, serialLane } from './flow.ts'
import type { AgentResult, Issue } from './followups.ts'
import type { ExecResult, FreshSandbox, LabelChange, NewIssue, Sandboxes, TaskDb, WarmSandbox } from './ports.ts'

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function writeFile(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** Commits files in a clone and pushes them to main on the exchange point. */
export function pushFiles(clone: string, files: Record<string, string>, message = 'change'): string {
  sh(clone, 'fetch', '--quiet', 'origin')
  sh(clone, 'checkout', '--quiet', '--detach', 'origin/main')
  for (const [path, content] of Object.entries(files)) writeFile(clone, path, content)
  sh(clone, 'add', '-A')
  sh(clone, 'commit', '--quiet', '-m', message)
  sh(clone, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main')
  return sh(clone, 'rev-parse', 'HEAD')
}

// ---------- task database ----------

export interface Comment { id: string; text: string }

export class FakeDb implements TaskDb {
  issues = new Map<string, Issue & { assignee?: string }>()
  comments: Comment[] = []
  closed: { id: string; reason: string }[] = []
  claims: string[] = []
  /** Tasks another run claims first: they still look ready, but the conditional claim fails. */
  lostClaims = new Set<string>()
  private next = 1

  add(issue: Issue): void {
    this.issues.set(issue.id, { status: 'open', labels: [], ...issue })
  }

  /** A task ready for the agent, with documents under docs/specs/<id>/. */
  addTask(id: string, docs = { prd: `docs/${id}/PRD.md`, requirements: `docs/${id}/requirements.md#r`, sd: `docs/${id}/sd.md` }): Issue {
    const issue: Issue = {
      id, title: `Task ${id}`, issue_type: 'task', status: 'open', labels: ['ready-for-agent'],
      acceptance_criteria: 'T-AC01: works', metadata: docs, parent: null,
    }
    this.add(issue)
    return issue
  }

  private get(id: string) {
    const issue = this.issues.get(id)
    if (!issue) throw new Error(`no issue ${id}`)
    return issue
  }

  ready = () => [...this.issues.values()].filter((i) => i.status === 'open' && i.labels?.includes('ready-for-agent') && (!i.assignee || this.lostClaims.has(i.id)))
  show = (id: string) => structuredClone(this.get(id))
  epics = () => [...this.issues.values()].filter((i) => i.issue_type === 'epic')
  listUnder = (epicId: string) => [...this.issues.values()].filter((i) => i.parent === epicId)
  assumptionTasks = () => []
  claim = (id: string) => {
    if (this.lostClaims.has(id) || this.get(id).assignee) return false
    this.claims.push(id)
    this.get(id).assignee = 'runner'
    this.get(id).status = 'in_progress'
    return true
  }
  unclaim = (id: string) => {
    delete this.get(id).assignee
    this.get(id).status = 'open'
  }
  comment = (id: string, text: string) => void this.comments.push({ id, text })
  listComments = (id: string) => this.comments.filter((c) => c.id === id).map((c) => ({ text: c.text }))
  update = (id: string, change: LabelChange) => {
    const issue = this.get(id)
    issue.labels = [...(issue.labels ?? []).filter((l) => !change.remove?.includes(l)), ...(change.add ?? [])]
    const metadata = { ...issue.metadata, ...change.setMetadata }
    for (const key of change.unsetMetadata ?? []) delete metadata[key]
    issue.metadata = metadata
  }
  create = (issue: NewIssue) => {
    const id = `new-${this.next++}`
    this.add({ id, title: issue.title, labels: issue.labels })
    return id
  }
  addDependency = () => {}
  close = (id: string, reason: string) => {
    this.get(id).status = 'closed'
    this.closed.push({ id, reason })
  }

  /** Puts a returned task back into the ready state, as preparation would. */
  handOffAgain(id: string): void {
    this.update(id, { remove: ['needs-info'], add: ['ready-for-agent'] })
  }
}

// ---------- agents and sandboxes ----------

/** What a stand-in agent does in one turn, in the task's worktree. */
export type AgentTurn = (ctx: { worktree: string; turn: number; prompt: string; branch: string }) => void | Promise<void>

export function doneResult(acs = ['T-AC01']): AgentResult {
  return { status: 'done', summary: 'done', evidence: acs.map((ac) => ({ ac, check: 'test', result: 'passed' })), question: null }
}

/** A stand-in agent that adds one file in a commit and writes a done result. */
export function committingAgent(file = 'feature.txt', content = 'feature\n'): AgentTurn {
  return ({ worktree }) => {
    writeFile(worktree, file, content)
    sh(worktree, 'add', file)
    sh(worktree, 'commit', '--quiet', '-m', `agent: ${file}`)
    writeFile(worktree, RESULT_FILE, JSON.stringify(doneResult()))
  }
}

export class FakeSandboxes implements Sandboxes {
  /** Exit code of the gate, per call; the last value repeats. */
  gateExits: number[] = [0]
  /** Overrides gateExits: the gate's exit code from the kind of sandbox and its worktree. */
  gate?: (kind: 'warm' | 'fresh', worktree: string) => number
  verdict: 'pass' | 'fail' = 'pass'
  /** Findings the stand-in reviewer reports with its verdict. */
  findings: unknown[] = []
  gateCalls = 0
  /** Gate runs and image builds in order, e.g. 'gate:warm', 'gate:fresh', 'image:<sha>'. */
  events: string[] = []
  reviews = 0
  reviewPrompts: string[] = []
  prompts: string[] = []
  /** Sandboxes opened, of each kind. */
  warmOpens = 0
  freshOpens = 0
  /** Worktrees kept by a closed warm sandbox because they had uncommitted changes, by branch. */
  private kept = new Map<string, string>()
  private counter = 0

  private repo: string
  private base: string
  agentTurn: AgentTurn
  /** Exit code of the reviewer's database start. */
  databaseExit = 0

  constructor(repo: string, base: string, agentTurn: AgentTurn) {
    this.repo = repo
    this.base = base
    this.agentTurn = agentTurn
  }

  private worktree(branch: string): string {
    const path = join(this.base, `wt-${this.counter++}`)
    sh(this.repo, 'worktree', 'add', '--quiet', path, branch)
    return path
  }

  private exec(worktree: string, command: string, kind: 'warm' | 'fresh'): ExecResult {
    if (command === GATE) {
      this.events.push(`gate:${kind}`)
      const code = this.gate ? this.gate(kind, worktree) : this.gateExits[Math.min(this.gateCalls, this.gateExits.length - 1)]!
      this.gateCalls++
      return { exitCode: code, stdout: code ? 'gate failed\n' : 'gate ok\n', stderr: '' }
    }
    if (command === REVIEW_DATABASE) {
      this.events.push(`database:${kind}`)
      return { exitCode: this.databaseExit, stdout: '', stderr: this.databaseExit ? 'pg_ctl failed\n' : '' }
    }
    if (command.startsWith('rm -f ')) {
      for (const file of command.slice(6).split(' ')) rmSync(join(worktree, file), { force: true })
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }

  /**
   * Opens a sandbox on the branch's work directory. Like Sandcastle, closing keeps a worktree
   * with uncommitted changes and a new sandbox on the same branch reuses it.
   */
  async warm(branch: string): Promise<WarmSandbox> {
    this.warmOpens++
    const worktree = this.kept.get(branch) ?? this.worktree(branch)
    this.kept.delete(branch)
    let turn = 0
    const play = async (prompt: string) => {
      this.prompts.push(prompt)
      await this.agentTurn({ worktree, turn: ++turn, prompt, branch })
    }
    return {
      worktreePath: worktree,
      exec: async (command) => this.exec(worktree, command, 'warm'),
      start: play,
      resume: async (prompt) => {
        await play(prompt)
        return true
      },
      close: async () => {
        if (sh(worktree, 'status', '--porcelain')) this.kept.set(branch, worktree)
        else sh(this.repo, 'worktree', 'remove', '--force', worktree)
      },
    }
  }

  async fresh(branch: string): Promise<FreshSandbox> {
    this.freshOpens++
    const worktree = this.worktree(branch)
    return {
      worktreePath: worktree,
      exec: async (command) => this.exec(worktree, command, 'fresh'),
      review: async (prompt) => {
        this.reviewPrompts.push(prompt)
        this.reviews++
        this.events.push('review')
        writeFile(worktree, REVIEW_FILE, JSON.stringify({ verdict: this.verdict, findings: this.findings }))
      },
      close: async () => void sh(this.repo, 'worktree', 'remove', '--force', worktree),
    }
  }
}

// ---------- the three places ----------

export interface World {
  base: string
  exchange: string
  owner: string
  runnerCopy: string
  /** A third clone for changes of other parties at the exchange point. */
  other: string
  db: FakeDb
  sandboxes: FakeSandboxes
  images: string[]
  notifications: { title: string; message: string }[]
  logs: string[]
  /** Each run's own log, by task id. */
  taskLogs: Map<string, string[]>
  runner: Runner
  /** Called on each pause of a waiting delivery; the test may repair GitHub here. */
  onPause: () => void
  pauses: number
  cleanup(): void
}

/** Builds the exchange point with an initial commit, the three clones and the runner on top. */
export function world(agentTurn: AgentTurn = committingAgent(), tasks: string[] = ['t-1']): World {
  const base = mkdtempSync(join(tmpdir(), 'runner-'))
  const exchange = join(base, 'exchange.git')
  sh(base, 'init', '--quiet', '--bare', '--initial-branch=main', exchange)
  const seed = join(base, 'seed')
  sh(base, 'clone', '--quiet', exchange, seed)
  writeFile(seed, '.sandcastle/runner.ts', '// runner v1\n')
  writeFile(seed, 'README.md', 'project\n')
  for (const id of tasks) {
    writeFile(seed, `docs/${id}/PRD.md`, '# PRD\n')
    writeFile(seed, `docs/${id}/requirements.md`, '# R\n')
    writeFile(seed, `docs/${id}/sd.md`, '# SD\n')
  }
  sh(seed, 'add', '-A')
  sh(seed, 'commit', '--quiet', '-m', 'initial')
  sh(seed, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main')

  const owner = join(base, 'owner')
  const runnerCopy = join(base, 'runner')
  const other = join(base, 'other')
  for (const clone of [owner, runnerCopy, other]) sh(base, 'clone', '--quiet', exchange, clone)
  for (const clone of [runnerCopy, other]) {
    sh(clone, 'config', 'user.name', 'Test')
    sh(clone, 'config', 'user.email', 'test@example.com')
  }
  excludeAgentFiles(runnerCopy)

  const db = new FakeDb()
  for (const id of tasks) db.addTask(id)
  const sandboxes = new FakeSandboxes(runnerCopy, base, agentTurn)
  const images: string[] = []
  const notifications: { title: string; message: string }[] = []
  const logs: string[] = []
  const taskLogs = new Map<string, string[]>()
  const runner: Runner = {
    repo: runnerCopy,
    db,
    sandboxes,
    images: { ensure: (commit) => { images.push(commit); sandboxes.events.push(`image:${commit}`) } },
    notifier: { notify: (title, message) => void notifications.push({ title, message }) },
    log: (message) => void logs.push(message),
    taskLog: (taskId) => {
      const own: string[] = []
      taskLogs.set(taskId, own)
      return (message) => {
        own.push(message)
        logs.push(message)
      }
    },
    slots: 1,
    exchange: serialLane(),
    startCommit: sh(runnerCopy, 'rev-parse', 'HEAD'),
    reportedVersions: new Set(),
    pause: async () => {
      w.pauses++
      if (w.pauses > 500) throw new Error('kept waiting')
      w.onPause()
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
  }
  const w: World = {
    base, exchange, owner, runnerCopy, other, db, sandboxes, images, notifications, logs, taskLogs, runner,
    onPause: () => {},
    pauses: 0,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  }
  return w
}

/** Branches, HEAD, index, status and file contents of a working copy. */
export function snapshot(dir: string) {
  return {
    refs: sh(dir, 'for-each-ref', '--format=%(refname) %(objectname)'),
    head: sh(dir, 'rev-parse', '--symbolic-full-name', 'HEAD') + sh(dir, 'rev-parse', 'HEAD'),
    index: sh(dir, 'ls-files', '--stage'),
    status: sh(dir, 'status', '--porcelain=v1', '--untracked-files=all'),
    files: sh(dir, 'ls-files', '--cached', '--others', '-z').split('\0').filter(Boolean)
      .map((path) => `${path} ${sh(dir, 'hash-object', '--', path)}`),
  }
}

export function exchangeMain(w: World): string {
  return sh(w.exchange, 'rev-parse', 'refs/heads/main')
}

export function exchangeFile(w: World, path: string): string | null {
  try {
    return sh(w.exchange, 'show', `main:${path}`)
  } catch {
    return null
  }
}

/**
 * Installs a pre-receive hook in the exchange point, so a test acts at the moment of the
 * runner's push: between its last fetch and the ref update. The script runs once per push
 * in the bare repository; `$1` is a counter file the test can read.
 */
export function onExchangePush(w: World, script: string): string {
  const counter = join(w.base, 'pushes')
  const hook = join(w.exchange, 'hooks', 'pre-receive')
  writeFileSync(hook, `#!/bin/sh\nn=$(($(cat "${counter}" 2>/dev/null || echo 0) + 1)); echo $n > "${counter}"\n${script}\n`)
  chmodSync(hook, 0o755)
  return counter
}

/**
 * Prepares another party's commit on top of the exchange point's main without moving main:
 * it waits on a side branch, and a push hook moves main to it, as a concurrent push would.
 */
export function racingCommit(w: World, files: Record<string, string>, message: string): string {
  sh(w.other, 'fetch', '--quiet', 'origin')
  sh(w.other, 'checkout', '--quiet', '--detach', 'origin/main')
  for (const [path, content] of Object.entries(files)) writeFile(w.other, path, content)
  sh(w.other, 'add', '-A')
  sh(w.other, 'commit', '--quiet', '-m', message)
  sh(w.other, 'push', '--quiet', 'origin', 'HEAD:refs/heads/race')
  return sh(w.other, 'rev-parse', 'HEAD')
}

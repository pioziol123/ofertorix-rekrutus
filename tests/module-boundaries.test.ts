import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modules = [
  'sources',
  'offers',
  'profile',
  'matching',
  'companies',
  'ai',
] as const

const isTest = (file: string) =>
  /\.test\.ts$/.test(file) || /\.fixtures\.ts$/.test(file)

function files(dir: string): string[] {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.(ts|vue|mjs|cjs)$/.test(entry.name) ? [path] : []
  })
}

/** The repository files a file imports by a relative path, extension resolved. */
function importsOf(file: string): string[] {
  const source = readFileSync(join(root, file), 'utf8')
  const found: string[] = []
  for (const match of source.matchAll(
    /(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g,
  )) {
    const base = resolve(join(root, dirname(file)), match[1]!)
    const target = ['', '.ts', '.vue', '/index.ts']
      .map((suffix) => base + suffix)
      .find((path) => existsSync(path) && statSync(path).isFile())
    if (target) found.push(relative(root, target))
  }
  return found
}

const moduleOf = (file: string) => /^modules\/([^/]+)\//.exec(file)?.[1]
const isEntry = (file: string) =>
  /^modules\/[^/]+\/(index|view)\.ts$/.test(file)

// Application code: the framework and startup files, the shared
// infrastructure and the modules. Tests are not clients of a module: a
// module's own tests lie next to it, and cross-cutting tests may substitute
// a module's adapters (ASSUMPTION(oferty-pracy-0mq.12/ASM-1)).
const application = [
  'app',
  'server',
  'worker',
  'scripts',
  'lib',
  'modules',
  'migrations',
  'plugins',
]
  .flatMap(files)
  .filter((file) => !isTest(file))

describe('module directories (A12-AC01, A12-AC02)', () => {
  it.each(modules)('%s has a public entry and a description', (name) => {
    expect(existsSync(join(root, 'modules', name, 'index.ts'))).toBe(true)
    expect(existsSync(join(root, 'modules', name, 'README.md'))).toBe(true)
  })

  it('reaches a module from outside only through its public entries (0mq.12 ASM-1)', () => {
    const bypasses = application.flatMap((file) =>
      importsOf(file)
        .filter((target) => {
          const owner = moduleOf(target)
          return owner && owner !== moduleOf(file) && !isEntry(target)
        })
        .map((target) => `${file} -> ${target}`),
    )
    expect(bypasses).toEqual([])
  })

  it('lets views reach modules only through their entries for views', () => {
    const views = files('app').flatMap((file) =>
      importsOf(file)
        .filter((target) => moduleOf(target) && !target.endsWith('/view.ts'))
        .map((target) => `${file} -> ${target}`),
    )
    expect(views).toEqual([])
  })

  it('keeps every entry for views free of server code', () => {
    const server =
      /from\s+['"](?:node:|pg['"]|pg-boss['"]|h3['"])|['"][^'"]*lib\/(?:db|queue)(?:\.ts)?['"]/
    const reached = new Set<string>()
    const pending = modules
      .map((name) => `modules/${name}/view.ts`)
      .filter((file) => existsSync(join(root, file)))
    while (pending.length) {
      const file = pending.pop()!
      if (reached.has(file)) continue
      reached.add(file)
      // Type-only imports leave no code in the browser bundle.
      const code = readFileSync(join(root, file), 'utf8').replace(
        /import type [^;]*?from\s+['"][^'"]+['"]/gs,
        '',
      )
      expect(code, file).not.toMatch(server)
      for (const match of code.matchAll(
        /(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g,
      )) {
        const target = relative(
          root,
          resolve(join(root, dirname(file)), match[1]!),
        )
        pending.push(target.endsWith('.ts') ? target : `${target}.ts`)
      }
    }
    expect(reached.size).toBeGreaterThan(modules.length - 1)
  })

  it('keeps the rules in domain/ free of configuration and storage', () => {
    const reads = modules
      .flatMap((name) => files(`modules/${name}/domain`))
      .filter((file) => !isTest(file))
      .filter((file) =>
        /process\.env|lib\/db(?:\.ts)?['"]/.test(
          readFileSync(join(root, file), 'utf8'),
        ),
      )
    expect(reads).toEqual([])
  })

  it('leaves in scripts only startup scripts, tooling and the helper tools the design keeps there (0mq.12 ASM-2)', () => {
    const listed = readdirSync(join(root, 'scripts')).sort()
    expect(listed).toEqual(
      [
        // Startup scripts named in package.json.
        'himalayas-sync.ts',
        'init-queue.ts',
        'jobspy-status.ts',
        'jobspy-sync.ts',
        'polish-status.ts',
        'polish-sync.ts',
        'source-status.ts',
        'source-sync.ts',
        'worker-health.ts',
        // Project tooling.
        'check-format.ts',
        'check-spec-altitude.ts',
        'check-spec-sync.ts',
        'format-changes.ts',
        'gate.sh',
        'setup-env.mjs',
        'spec-altitude.ts',
        'spec-sync.ts',
        'test-integration.sh',
        // The Sources connectors' Python helper tools, which the solution
        // design keeps here as startup files (ASSUMPTION(oferty-pracy-0mq.12/ASM-2)).
        'jobspy-runner.py',
        'polish-runner.py',
        'polish_json_sources.py',
        'polish_sources.py',
      ].sort(),
    )
  })

  it('leaves outside the modules only the shared infrastructure in lib', () => {
    expect(
      files('lib')
        .filter((file) => !isTest(file))
        .sort(),
    ).toEqual(
      [
        'lib/contact-details.ts',
        'lib/db.ts',
        // The existing way to the queue, until oferty-pracy-2ba.6 (B1-D14).
        'lib/queue.ts',
        // The queue library (oferty-pracy-2ba.1).
        'lib/queues/configuration.ts',
        'lib/queues/connection.ts',
        'lib/queues/consumer.ts',
        'lib/queues/definition.ts',
        'lib/queues/index.ts',
        'lib/queues/prepare.ts',
        'lib/queues/send.ts',
        // The worker library (oferty-pracy-2ba.1).
        'lib/workers/index.ts',
        'lib/workers/messages.ts',
        'lib/workers/pool-process.ts',
        'lib/workers/pool.ts',
        'lib/workers/registry.ts',
        'lib/workers/worker.ts',
      ].sort(),
    )
  })

  it('starts the worker library before the existing path in the worker entry (B1-R04, B1-R14)', () => {
    const entry = readFileSync(join(root, 'worker/index.ts'), 'utf8')
    const library = entry.indexOf('await startWorker(')
    expect(library).toBeGreaterThan(-1)
    for (const existing of [
      'await boss.start()',
      'await workSyncQueue(',
      'await workCvTextQueue(',
      'await boss.work',
      'await schedule()',
    ])
      expect(library, existing).toBeLessThan(entry.indexOf(existing))
  })

  it('runs the module plugins only in the worker and its pool processes (B1-AC15)', () => {
    const runners = application.filter((file) =>
      importsOf(file).includes('plugins/index.ts'),
    )
    expect(runners).toEqual([])
    // The worker entry passes the plugins index by path to the worker
    // library, which runs it and passes it to its pool processes.
    expect(readFileSync(join(root, 'worker/index.ts'), 'utf8')).toContain(
      "new URL('../plugins/index.ts', import.meta.url)",
    )
    // The web application loads neither the plugins nor the worker library.
    const web = [...files('server'), ...files('app')].filter((file) =>
      /plugins\/index|lib\/workers/.test(
        readFileSync(join(root, file), 'utf8'),
      ),
    )
    expect(web).toEqual([])
  })

  it('runs no module code in the migration step: neither the database migrations nor the queue step import a module or the plugins (B1-AC02, B1-D05)', () => {
    const step = [...files('migrations'), 'scripts/init-queue.ts']
    const reached = new Set<string>()
    const visit = (file: string) => {
      if (reached.has(file)) return
      reached.add(file)
      importsOf(file).forEach(visit)
    }
    step.forEach(visit)
    expect(
      [...reached].filter((file) => /^(modules|plugins)\//.test(file)),
    ).toEqual([])
  })
})

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
  'recruitments',
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
  'periodic',
  'scripts',
  'lib',
  'modules',
  'migrations',
  'plugins',
  'receivers',
]
  .flatMap(files)
  .filter((file) => !isTest(file))

// The layers inside a module and the directions its files may import in
// (docs/architecture/ddd-clean-hexagonal.md, "The layers of a module"). The
// check covers the modules already brought to the guidelines; a module
// joins the list in the change that brings it there.
const layered = ['ai'] as const

type Layer =
  'domain' | 'ports' | 'operations' | 'adapters' | 'persistence' | 'driving'

/** The layer of a module's file; undefined for its entries and other files. */
function layerOf(file: string): Layer | undefined {
  const inside = /^modules\/[^/]+\/(.+\.ts)$/.exec(file)?.[1]
  if (!inside || /^(index|view)\.ts$/.test(inside)) return undefined
  if (inside.startsWith('domain/')) return 'domain'
  if (inside.startsWith('ports/')) return 'ports'
  if (inside.startsWith('infrastructure/adapters/')) return 'adapters'
  if (inside.startsWith('infrastructure/persistence/')) return 'persistence'
  if (inside.startsWith('infrastructure/')) return 'driving'
  return 'operations'
}

/** The layers of its own module a layer's files may import. */
const inward: Record<Layer, readonly Layer[]> = {
  domain: ['domain'],
  ports: ['domain', 'ports'],
  operations: ['domain', 'ports', 'operations', 'persistence'],
  adapters: ['domain', 'ports', 'adapters'],
  persistence: ['domain', 'ports', 'persistence'],
  driving: ['domain', 'ports', 'operations', 'driving'],
}

/** The place that assembles a module's adapters, which operations may ask. */
const isAdapterRegistry = (file: string) =>
  /^modules\/[^/]+\/infrastructure\/adapters\/registry\.ts$/.test(file)

/**
 * The relative imports of a file, each with whether it is type-only: every
 * statement that names the file is an `import type` or an `export type`.
 */
function importStatementsOf(file: string) {
  const source = readFileSync(join(root, file), 'utf8')
  const count = (specifiers: Iterable<RegExpMatchArray>) => {
    const counts = new Map<string, number>()
    for (const match of specifiers)
      counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1)
    return counts
  }
  const all = count(
    source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g,
    ),
  )
  const typed = count(
    source.matchAll(
      /\b(?:import|export)\s+type\b[^'"]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g,
    ),
  )
  const found: { target: string; typeOnly: boolean }[] = []
  for (const [specifier, times] of all) {
    const base = resolve(join(root, dirname(file)), specifier)
    const target = ['', '.ts', '/index.ts']
      .map((suffix) => base + suffix)
      .find((path) => existsSync(path) && statSync(path).isFile())
    if (target)
      found.push({
        target: relative(root, target),
        typeOnly: typed.get(specifier) === times,
      })
  }
  return found
}

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

  it.each(layered)(
    'keeps the dependencies inside %s pointing inward: the domain imports only the domain, a port only the domain and ports, an operation no adapter but their registry, and an adapter or a repository no operation',
    (name) => {
      const own = files(`modules/${name}`).filter((file) => !isTest(file))
      const outward = own.flatMap((file) => {
        const layer = layerOf(file)
        if (!layer) return []
        return importStatementsOf(file)
          .filter(({ target, typeOnly }) => {
            if (moduleOf(target) !== name)
              // Outside the module: nothing for the domain, types alone
              // for a port; the other layers follow the rules above.
              return layer === 'domain' || (layer === 'ports' && !typeOnly)
            const reached = layerOf(target)
            if (!reached) return true // the module's own entry
            if (layer === 'operations' && isAdapterRegistry(target))
              return false
            return !inward[layer].includes(reached)
          })
          .map(({ target }) => `${file} -> ${target}`)
      })
      expect(outward).toEqual([])
      // The domain and the ports run no platform code either.
      const platform = own
        .filter((file) => ['domain', 'ports'].includes(layerOf(file) ?? ''))
        .filter((file) =>
          /from\s+['"]node:|process\.env/.test(
            readFileSync(join(root, file), 'utf8'),
          ),
        )
      expect(platform).toEqual([])
      // The check found the module's layers.
      expect([...new Set(own.map(layerOf))]).toEqual(
        expect.arrayContaining(['domain', 'operations']),
      )
    },
  )

  it('leaves in scripts only startup scripts, tooling and the helper tools the design keeps there (0mq.12 ASM-2)', () => {
    const listed = readdirSync(join(root, 'scripts')).sort()
    expect(listed).toEqual(
      [
        // Startup scripts named in package.json.
        'carry-over-jobs.ts',
        'end-old-ai-work.ts',
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
        'git-dashboard.mjs',
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
        // The paging library (oferty-pracy-lq3.4).
        'lib/paging.ts',
        // The time library (oferty-pracy-nq3.6).
        'lib/time/arithmetic.ts',
        'lib/time/calendar.ts',
        'lib/time/display.ts',
        'lib/time/index.ts',
        'lib/time/polish-zone.ts',
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

  it('keeps Temporal and the time zone inside the time library (T6-AC08)', () => {
    const code = ['lib', 'modules', 'server', 'app', 'worker', 'periodic']
      .flatMap(files)
      .filter((file) => !isTest(file))
    const temporal = code.filter((file) =>
      readFileSync(join(root, file), 'utf8').includes('temporal-polyfill'),
    )
    expect(temporal).toEqual(['lib/time/polish-zone.ts'])
    const zone = files('lib/time').filter((file) =>
      readFileSync(join(root, file), 'utf8').includes("'Europe/Warsaw'"),
    )
    expect(zone).toEqual(['lib/time/polish-zone.ts'])
  })

  it('leaves the Sources module no Polish time outside the time library (T6-AC06)', () => {
    const own = files('modules/sources')
      .filter((file) => !isTest(file))
      .filter((file) =>
        /Europe\/Warsaw|timeZone|toLocale|Intl\.DateTimeFormat|AT TIME ZONE|date_trunc/.test(
          readFileSync(join(root, file), 'utf8'),
        ),
      )
    expect(own).toEqual([])
  })

  it('leaves the worker entry only the worker library: no module, no queue client, no timer (B6-AC08, B6-AC10)', () => {
    const entry = readFileSync(join(root, 'worker/index.ts'), 'utf8')
    expect(entry).toContain('await startWorker(')
    expect(
      importsOf('worker/index.ts').filter((file) => moduleOf(file)),
    ).toEqual([])
    expect(entry).not.toMatch(/pg-boss|lib\/queue\b|setInterval|setTimeout/)
  })

  it('runs the periodic work in its own process through public operations of the modules, without the plugins (B6-R09)', () => {
    const imports = [
      ...importsOf('periodic/index.ts'),
      ...importsOf('periodic/steps.ts'),
    ]
    expect(imports).toEqual(
      expect.arrayContaining([
        'modules/ai/index.ts',
        'modules/sources/index.ts',
      ]),
    )
    // The Profile has no step: it requests no AI work by itself (epic sq2,
    // T7-AC04). The receivers' registration reaches it only for its receiver.
    expect(importsOf('periodic/steps.ts')).not.toContain(
      'modules/profile/index.ts',
    )
    expect(
      imports.filter(
        (file) =>
          /^(plugins|lib\/workers)\//.test(file) ||
          (moduleOf(file) && !isEntry(file)),
      ),
    ).toEqual([])
  })

  it('keeps the AI module, the worker, the periodic process, the web application and the command-line scripts free of the existing way to the queue (B6-AC10)', () => {
    const existingWay =
      /from\s+['"]pg-boss['"]|lib\/queue(?:\.ts)?['"]|\b(?:useAiQueue|aiExecutionQueue|recoverExecutions|createBoss|queueClient)\b/
    const read = (file: string) => readFileSync(join(root, file), 'utf8')
    const reaching = [
      ...files('modules/ai'),
      ...files('worker'),
      ...files('periodic'),
      ...files('server'),
      ...files('app'),
      ...files('scripts').filter(
        // The carry-over names the former queue to remove it (B6-R10).
        (file) => file !== 'scripts/carry-over-jobs.ts',
      ),
    ]
      .filter((file) => !isTest(file) && /\.(ts|vue)$/.test(file))
      .filter((file) => existingWay.test(read(file)))
    expect(reaching).toEqual([])
    expect(existsSync(join(root, 'lib/queue.ts'))).toBe(false)
  })

  it('carries AI jobs out through the worker library and the AI module plugin (B6-AC10)', () => {
    expect(importsOf('plugins/index.ts')).toContain('plugins/ai.ts')
    expect(importsOf('plugins/ai.ts')).toContain('modules/ai/index.ts')
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

  it('runs the shared registration of receivers of assignments in the web application, the periodic process, the worker and its pool processes, apart from the module plugins (epic sq2, T6)', () => {
    for (const file of [
      'server/plugins/assignment-receivers.ts',
      'periodic/index.ts',
      'plugins/index.ts',
    ])
      expect(importsOf(file)).toContain('receivers/index.ts')
    // It registers receivers only, through the AI module's public entry.
    const imports = importsOf('receivers/index.ts')
    expect(imports).toContain('modules/ai/index.ts')
    expect(imports.filter((file) => !isEntry(file))).toEqual([])
    expect(readFileSync(join(root, 'receivers/index.ts'), 'utf8')).not.toMatch(
      /HandlerRegistry|lib\/workers/,
    )
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

  it("carries work over at the migration step through the modules' public operations only, without the plugins (B1-D05, B4-R08, B5-R08)", () => {
    const imports = importsOf('scripts/carry-over-jobs.ts')
    expect(imports).toContain('modules/profile/index.ts')
    expect(imports).toContain('modules/sources/index.ts')
    expect(
      imports.filter(
        (file) => /^plugins\//.test(file) || (moduleOf(file) && !isEntry(file)),
      ),
    ).toEqual([])
  })

  it("ends the matters of the old AI way at the migration step through the requesting modules' public operations only, without the plugins (epic sq2, T10-R02)", () => {
    const imports = importsOf('scripts/end-old-ai-work.ts')
    for (const module of ['profile', 'matching', 'companies'])
      expect(imports).toContain(`modules/${module}/index.ts`)
    expect(
      imports.filter(
        (file) => /^plugins\//.test(file) || (moduleOf(file) && !isEntry(file)),
      ),
    ).toEqual([])
  })

  it('keeps the Profile module free of the queue implementation (B4-AC07)', () => {
    const reaching = files('modules/profile')
      .filter((file) => !isTest(file))
      .filter((file) =>
        /from\s+['"]pg-boss['"]|lib\/queue(?:\.ts)?['"]/.test(
          readFileSync(join(root, file), 'utf8'),
        ),
      )
    expect(reaching).toEqual([])
  })

  it('keeps the Sources module, the web application and the command-line scripts free of the queue implementation for syncs (B5-AC08)', () => {
    const queueImplementation = /from\s+['"]pg-boss['"]|lib\/queue(?:\.ts)?['"]/
    const syncQueue =
      /\b(?:useSyncQueue|workSyncQueue|recoverSyncRuns|syncQueue)\b/
    const read = (file: string) => readFileSync(join(root, file), 'utf8')
    const reachSources = (file: string) =>
      importsOf(file).includes('modules/sources/index.ts')
    // The module itself.
    expect(
      files('modules/sources')
        .filter((file) => !isTest(file))
        .filter((file) => queueImplementation.test(read(file))),
    ).toEqual([])
    // The scripts that request or read syncs; the carry-over script still
    // reads the former queue to remove it (B5-R08).
    const scripts = files('scripts').filter(
      (file) => reachSources(file) && file !== 'scripts/carry-over-jobs.ts',
    )
    expect(scripts).toEqual(
      expect.arrayContaining([
        'scripts/himalayas-sync.ts',
        'scripts/jobspy-sync.ts',
        'scripts/polish-sync.ts',
        'scripts/source-sync.ts',
      ]),
    )
    expect(
      scripts.filter((file) => queueImplementation.test(read(file))),
    ).toEqual([])
    // The web application: no route connects a queue client for a sync, and
    // nothing connects the former sync queue.
    const web = files('server')
    expect(web.filter(reachSources)).not.toEqual([])
    expect(
      web
        .filter(reachSources)
        .filter((file) => /queueClient\(/.test(read(file))),
    ).toEqual([])
    expect(web.filter((file) => syncQueue.test(read(file)))).toEqual([])
  })

  it('carries sync jobs out through the worker library and the Sources module plugin, not the existing path of the worker entry (B5-AC08)', () => {
    expect(importsOf('plugins/index.ts')).toContain('plugins/sources.ts')
    expect(importsOf('plugins/sources.ts')).toContain(
      'modules/sources/index.ts',
    )
    const entry = readFileSync(join(root, 'worker/index.ts'), 'utf8')
    expect(entry).not.toMatch(
      /\b(?:useSyncQueue|workSyncQueue|recoverSyncRuns|syncQueue)\b|['"]source-sync['"]/,
    )
  })
})

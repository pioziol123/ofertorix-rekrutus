import type { AnyJobDefinition, JobDefinition } from '../queues/index.ts'

/**
 * The handler registry: by job definition name (its queue), the definition,
 * the job handler and the optional failure handler the worker may call.
 */

/** Gets exactly the data the module put into the job (B1-D09). */
export type JobHandler<Data> = (data: Data) => Promise<void> | void

/**
 * Called with the job's data after the job failed finally, also when the
 * worker died in its last attempt. It may be called more than once, so it
 * must tolerate a repeat.
 */
export type FailureHandler<Data> = (data: Data) => Promise<void> | void

export type Registration = {
  readonly definition: AnyJobDefinition
  readonly handler: JobHandler<object>
  readonly failureHandler?: FailureHandler<object>
}

export class HandlerRegistry {
  readonly #registrations = new Map<string, Registration>()

  /** Registers a definition's handlers; a second registration throws. */
  register<Data extends object>(
    definition: JobDefinition<Data>,
    handler: JobHandler<Data>,
    failureHandler?: FailureHandler<Data>,
  ): void {
    if (this.#registrations.has(definition.queue))
      throw new Error(
        `Job definition "${definition.queue}" is already registered`,
      )
    this.#registrations.set(definition.queue, {
      definition,
      handler: handler as JobHandler<object>,
      failureHandler: failureHandler as FailureHandler<object> | undefined,
    })
  }

  /** The registration of a job definition name, if any. */
  get(name: string): Registration | undefined {
    return this.#registrations.get(name)
  }

  /** The registered job definitions. */
  definitions(): AnyJobDefinition[] {
    return [...this.#registrations.values()].map(
      (registration) => registration.definition,
    )
  }
}

/** A module's plugin: registers the module's job definitions and handlers. */
export type ModulePlugin = (registry: HandlerRegistry) => void | Promise<void>

/** The registration of one module failed; names the module. */
export class ModulePluginError extends Error {
  constructor(
    readonly module: string,
    cause: unknown,
  ) {
    super(
      `Module plugin "${module}" failed to register: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
    this.name = 'ModulePluginError'
  }
}

/**
 * Runs every module plugin once against the registry, in order. A plugin
 * that throws stops the run with a `ModulePluginError` naming its module.
 */
export async function runPlugins(
  plugins: Readonly<Record<string, ModulePlugin>>,
  registry: HandlerRegistry,
): Promise<void> {
  for (const [module, plugin] of Object.entries(plugins)) {
    try {
      await plugin(registry)
    } catch (error) {
      throw new ModulePluginError(module, error)
    }
  }
}

/** What a plugins index exports: one function that runs every module plugin. */
export type PluginsIndex = {
  runModulePlugins(registry: HandlerRegistry): Promise<void>
}

/** Loads a plugins index by file path or URL and runs it into a new registry. */
export async function loadRegistry(plugins: string): Promise<HandlerRegistry> {
  const index = (await import(plugins)) as PluginsIndex
  const registry = new HandlerRegistry()
  await index.runModulePlugins(registry)
  return registry
}

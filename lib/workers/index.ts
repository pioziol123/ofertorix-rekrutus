/**
 * The worker library: the handler registry modules fill from their module
 * plugins, and the worker that takes jobs from every registered job
 * definition's queues and carries each out in a process of a fixed pool.
 * Design: docs/specs/2ba-praca-w-tle/solution-design.md#b1.
 */
export {
  HandlerRegistry,
  ModulePluginError,
  runPlugins,
  type FailureHandler,
  type JobHandler,
  type ModulePlugin,
  type PluginsIndex,
  type Registration,
} from './registry.ts'
export {
  defaultPoolSize,
  poolSizeFromEnvironment,
  startWorker,
  type Worker,
  type WorkerOptions,
} from './worker.ts'

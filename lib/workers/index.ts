/**
 * The worker library: the handler registry modules fill from their module
 * plugins, and the worker that takes jobs from every registered job
 * definition's queues and carries each out in a process of a fixed pool.
 * Design: docs/specs/2ba-praca-w-tle/solution-design.md#b1.
 */
export { HandlerRegistry, runPlugins, type ModulePlugin } from './registry.ts'
export { startWorker } from './worker.ts'

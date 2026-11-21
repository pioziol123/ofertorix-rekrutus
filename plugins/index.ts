/**
 * The plugins index: runs every module plugin once against the handler
 * registry. Only the worker and the processes of its pool run it; the web
 * application, the migration step and the command-line scripts send jobs
 * without loading handling code (B1-R15).
 *
 * A module that handles queue jobs adds its plugin file to this directory,
 * registering its job definitions with their job handlers and failure
 * handlers, and lists it below under the module's name. Each job
 * definition's queue is created by a queue migration in the migrations
 * directory, written once, that calls the queue library's `createQueue`
 * with the queue name and key mode written in it and imports no module
 * (B1-D05); an automated test keeps the two key modes equal (B1-D15).
 *
 * Before the module plugins, it runs the shared registration of the
 * receivers of assignments, which is not a module plugin: the worker and
 * its pool processes run it here, as the web application and the periodic
 * process run it at their start (epic sq2, T6).
 */
import {
  runPlugins,
  type HandlerRegistry,
  type ModulePlugin,
} from '../lib/workers/index.ts'
import { registerAssignmentReceivers } from '../receivers/index.ts'
import { registerAiJobs } from './ai.ts'
import { registerProfileJobs } from './profile.ts'
import { registerSourcesJobs } from './sources.ts'

const modulePlugins: Record<string, ModulePlugin> = {
  ai: registerAiJobs,
  profile: registerProfileJobs,
  sources: registerSourcesJobs,
}

export async function runModulePlugins(
  registry: HandlerRegistry,
): Promise<void> {
  registerAssignmentReceivers()
  await runPlugins(modulePlugins, registry)
}

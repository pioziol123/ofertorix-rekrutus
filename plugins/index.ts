/**
 * The plugins index: runs every module plugin once against the handler
 * registry. Only the worker, the processes of its pool and the migration
 * step run it; the web application and the command-line scripts send jobs
 * without loading handling code (B1-R15).
 * ASSUMPTION(oferty-pracy-2ba.1/ASM-1): the migration step is not one of the
 * command-line scripts of B1-R15.
 *
 * A module that handles queue jobs adds its plugin file to this directory,
 * registering its job definitions with their job handlers and failure
 * handlers, and lists it below under the module's name.
 */
import {
  runPlugins,
  type HandlerRegistry,
  type ModulePlugin,
} from '../lib/workers/index.ts'

const modulePlugins: Record<string, ModulePlugin> = {}

export async function runModulePlugins(
  registry: HandlerRegistry,
): Promise<void> {
  await runPlugins(modulePlugins, registry)
}

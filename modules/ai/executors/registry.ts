import type { Executor } from './declaration.ts'
import { ollamaExecutor } from './ollama.ts'
import { openAiExecutor } from './openai.ts'

/**
 * The executors of assignments by name. An executor is built anew on each
 * lookup, so its declaration follows the AI configuration and the
 * environment of now.
 */
const executors = new Map<string, () => Executor>([
  ['openai', () => openAiExecutor()],
  ['ollama', () => ollamaExecutor()],
])

export function findExecutor(name: string): Executor | undefined {
  return executors.get(name)?.()
}

/**
 * Registers an executor, replacing one of the same name, e.g. a test
 * executor or an executor on a simulated provider in a test.
 */
export function registerExecutor(executor: Executor): void {
  executors.set(executor.name, () => executor)
}

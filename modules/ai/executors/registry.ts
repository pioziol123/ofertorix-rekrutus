import type { ExecutorDeclaration } from './declaration.ts'
import { ollamaDeclaration } from './ollama.ts'
import { openAiDeclaration } from './openai.ts'

/**
 * The executors of assignments by name. A declaration is read anew on each
 * lookup, so it follows the AI configuration and the environment of now.
 */
const executors = new Map<string, () => ExecutorDeclaration>([
  ['openai', openAiDeclaration],
  ['ollama', ollamaDeclaration],
])

export function executorDeclaration(
  name: string,
): ExecutorDeclaration | undefined {
  return executors.get(name)?.()
}

/**
 * Registers an executor, replacing one of the same name, e.g. a test
 * executor in a test.
 */
export function registerExecutor(declaration: ExecutorDeclaration): void {
  executors.set(declaration.name, () => declaration)
}

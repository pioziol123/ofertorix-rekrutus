import type { ExecutionMode } from './domain/execution-mode.ts'
import { ollamaProvider } from './infrastructure/adapters/ollama.ts'
import { openAiProvider } from './infrastructure/adapters/openai.ts'
import type { ProviderAdapter } from './provider-adapter.ts'

/** The adapters AI runs, by provider; the built-in ones are registered. */
const adapters = new Map<string, ProviderAdapter>(
  [openAiProvider(), ollamaProvider()].map((adapter) => [
    adapter.provider,
    adapter,
  ]),
)

/**
 * The adapter of an execution: the one of the provider its settings name,
 * or, for an execution saved without provider settings (moved by migration
 * 18 from before AI kept them), the adapter that declares it ran those
 * executions. ASSUMPTION(oferty-pracy-0mq.21/ASM-8)
 */
export function adapterOfExecution(
  provider: string | undefined,
): ProviderAdapter | undefined {
  if (provider !== undefined) return adapters.get(provider)
  return [...adapters.values()].find((adapter) => adapter.ranBeforeSettings)
}

/**
 * Registers the adapter of a provider, replacing the one registered before,
 * e.g. a simulated provider in a test.
 */
export function registerProviderAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.provider, adapter)
}

export function providerAdapter(provider: string): ProviderAdapter | undefined {
  return adapters.get(provider)
}

/**
 * Whether an adapter of the provider runs the mode. The adapter contract
 * defines a handler only for the modes the coordination can run, so a mode
 * is accepted only when it can be carried out; a request in any other mode
 * is refused before anything is reserved. Batch and agent handlers come with
 * their adapters in task oferty-pracy-0mq.17.
 */
export function supportsMode(provider: string, mode: ExecutionMode): boolean {
  const modes: Partial<Record<ExecutionMode, unknown>> =
    adapters.get(provider)?.modes ?? {}
  return typeof modes[mode] === 'function'
}

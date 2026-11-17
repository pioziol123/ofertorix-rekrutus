import type { ExecutionMode } from './domain/execution-mode.ts'
import { openAiProvider } from './infrastructure/adapters/openai.ts'
import type { ProviderAdapter } from './provider-adapter.ts'

/** The adapters AI runs, by provider; the built-in ones are registered. */
const adapters = new Map<string, ProviderAdapter>(
  [openAiProvider()].map((adapter) => [adapter.provider, adapter]),
)

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
 * Whether an adapter of the provider declares the mode. A request in a
 * mode that no adapter declares is refused before anything is reserved.
 */
export function supportsMode(provider: string, mode: ExecutionMode): boolean {
  const modes: Partial<Record<ExecutionMode, unknown>> =
    adapters.get(provider)?.modes ?? {}
  return modes[mode] !== undefined
}

/**
 * The execution settings AI keeps for its clients, one entry per settings
 * key. A client defines its key and decides its provider, model and
 * reasoning effort; AI keeps and validates them. The object is data: no AI
 * code depends on a key's value, and the keys appear only in this file.
 * Fixed in code for now; a later task moves them to a table changed through
 * an AI operation.
 */
export const clientSettings: Readonly<Record<string, unknown>> = {
  profile: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' },
  matching: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' },
  research: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' },
}

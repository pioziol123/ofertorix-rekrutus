/** How the work runs: one call, an item of a provider batch, or agent work. */
export type ExecutionMode = 'single' | 'batch' | 'agent'

/**
 * The tools agent work may use, the same for every provider: `web_search`
 * searches the web and reads the pages it finds. A client names them from
 * this list; each agent adapter maps them to its provider's protocol and
 * declares which it offers. ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
 */
export const agentTools = ['web_search'] as const
export type AgentTool = (typeof agentTools)[number]

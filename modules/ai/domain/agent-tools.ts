/**
 * The tools agent work may use, the same for every provider: `web_search`
 * searches the web and reads the pages it finds. A requesting module names
 * them from this list; each executor maps them to its provider's protocol
 * and declares which it offers. ASSUMPTION(oferty-pracy-0mq.22/ASM-3)
 */
export const agentTools = ['web_search'] as const
export type AgentTool = (typeof agentTools)[number]

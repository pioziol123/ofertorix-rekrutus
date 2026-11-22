// ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the materials of agent work, which
// the paid agent session gathers and assignment handling passes to the
// receiver of an agent assignment.

/** A source an agent's tool opened or found, cited by a material. */
export type AgentSource = {
  url: string
  title: string
  /** An opened page, or a result of a search seen only as a snippet. */
  kind: 'page' | 'search_snippet'
  accessedAt: string
}

/**
 * A unit of material an agent gathered with its tools: a text and the
 * sources it cites. The agent's result refers to a material by its id.
 */
export type AgentMaterial = {
  id: number
  text: string
  sources: AgentSource[]
}

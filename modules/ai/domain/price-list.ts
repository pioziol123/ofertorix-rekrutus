/**
 * The price list of a model for one assignment type, with the token caps a
 * reservation covers. Amounts are decimal strings, see the cost arithmetic.
 */
export type PriceList = {
  model: string
  version: string
  inputUsdPerMillion: string
  outputUsdPerMillion: string
  usdPln: string
  fxVersion: string
  maxInputTokens: number
  maxOutputTokens: number
  /**
   * The price of one call of the paid tool of the agent mode (web search),
   * in USD, and the most calls a reservation covers. Absent when the price
   * list covers no paid tool. ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
   */
  toolCallUsd?: string
  maxToolCalls?: number
}

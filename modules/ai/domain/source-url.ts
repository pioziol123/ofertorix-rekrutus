/**
 * A URL a material of agent work may cite: HTTP(S), without credentials,
 * at most 3000 characters. An agent keeps no material citing another URL,
 * and a client that checks the sources of the materials it receives reads
 * this rule from the AI entry point, so the rule has one owner.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-5)
 */
export const safeSourceUrl = (value: string) => {
  try {
    const url = new URL(value)
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      value.length <= 3000
    )
  } catch {
    return false
  }
}

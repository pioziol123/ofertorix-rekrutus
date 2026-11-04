/** Evidence-based location assessment; unrecognised wording remains unknown. */
export type RemoteEligibility = {
  status: 'allowed' | 'excluded' | 'unknown'
  reason: string
  evidence: string[]
}
type Record = { title?: unknown; description?: unknown; is_remote?: unknown }
export function assessRemoteEligibility(record: Record): RemoteEligibility {
  const text = [record.title, record.description]
    .filter((s): s is string => typeof s === 'string')
    .join('\n')
    .replace(/<[^>]*>/g, ' ')
    .slice(0, 200_000)
  const sentences = text
    .split(/[\n!?;]+|\.(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
  const positive: string[] = [],
    negative: string[] = []
  const regions =
    '(?:worldwide|anywhere(?: in (?:the world|poland|europe|the eu))?(?!\\s+(?:in|within|across)\\b)|poland|polska|polski|europe|european union|eu|eea|european economic area)'
  const foreign =
    '(?:the )?(?:u\\.?s\\.?a?\\.?|united states|canada|india|bangladesh|france|uk|united kingdom|germany|australia)'
  const allow = new RegExp(
    `\\b(?:remote(?:ly)?(?: work)?(?: from| in| within| across)?|work(?:ing)? (?:from|anywhere in))\\s*[:–-]?\\s*${regions}\\b`,
    'i',
  )
  const foreignOnly = new RegExp(
    `\\b${foreign}[- ](?:only|residents? only)\\b|\\b(?:must|have to|need to|required to) (?:be (?:based|located)|reside|live|work) (?:in|within) ${foreign}\\b|\\bonly (?:candidates?|applicants?) (?:from|in|based in|located in) ${foreign}\\b`,
    'i',
  )
  for (const sentence of sentences) {
    const evidence = sentence.slice(0, 400)
    if (
      (foreignOnly.test(sentence) &&
        !/\b(?:not|no longer|never)\b/i.test(sentence)) ||
      /\b(?:on[- ]site only|hybrid role|hybrid position|not (?:a )?(?:fully )?remote|no remote work|télétravail partiel|praca hybrydowa|wyłącznie stacjonarnie)\b/i.test(
        sentence,
      )
    )
      negative.push(evidence)
    // Negated or qualified declarations need interpretation, never positive inference.
    if (
      !/\b(?:not|except|excluding|outside|cannot|can't|unable|however|but)\b/i.test(
        sentence,
      ) &&
      (allow.test(sentence) ||
        /\b(?:work from anywhere(?: in (?:the world|poland|europe|the eu))?(?!\s+(?:in|within|across)\b)|praca zdalna z polski|télétravail depuis la pologne|remote (?:within|across) (?:the )?eu)\b/i.test(
          sentence,
        ))
    )
      positive.push(evidence)
  }
  if (record.is_remote === false)
    negative.push('Źródło oznaczyło ofertę jako niezdalną.')
  const evidence = [...new Set([...negative, ...positive])].slice(0, 6)
  if (positive.length && negative.length)
    return {
      status: 'unknown',
      reason:
        'Sprzeczne informacje o miejscu lub trybie pracy; wymaga sprawdzenia.',
      evidence,
    }
  if (negative.length)
    return {
      status: 'excluded',
      reason: 'Wykryto ograniczenie niezgodne z pracą w pełni zdalną z Polski.',
      evidence,
    }
  if (positive.length)
    return {
      status: 'allowed',
      reason:
        'Opis wskazuje obszar pracy obejmujący Polskę. Pozostałe warunki zatrudnienia wymagają osobnej oceny.',
      evidence,
    }
  return {
    status: 'unknown',
    reason:
      'Nie potwierdzono możliwości pracy w pełni zdalnej z Polski. Kraj ogłoszenia i etykieta remote nie wystarczają.',
    evidence: [],
  }
}
export function remoteEligibilityLabel(value: RemoteEligibility): string {
  return value.status === 'allowed'
    ? 'Praca z Polski: potwierdzona w opisie'
    : value.status === 'excluded'
      ? 'Praca z Polski: wykryto niezgodność'
      : 'Praca z Polski: niepotwierdzona'
}

export const polishCatalog = {
  bulldogjob: { name: 'Bulldogjob', host: 'bulldogjob.pl' },
  theprotocol: { name: 'theprotocol.it', host: 'theprotocol.it' },
  justjoinit: { name: 'Just Join IT', host: 'justjoin.it' },
  nofluffjobs: { name: 'No Fluff Jobs', host: 'nofluffjobs.com' },
} as const
export const polishSources = [
  'bulldogjob',
  'theprotocol',
  'justjoinit',
  'nofluffjobs',
] as const
export type PolishSource = (typeof polishSources)[number]

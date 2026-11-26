import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T10-AC04 and T10-AC08 of epic sq2 (task oferty-pracy-sq2.11), as a code
 * search: the application's code, every file outside the tests and the
 * migrations, which are the history of the schema, holds nothing of the
 * old way of requesting AI work.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const codeDirectories = [
  'app',
  'lib',
  'modules',
  'periodic',
  'plugins',
  'receivers',
  'scripts',
  'server',
  'worker',
]

function codeFiles(dir: string): string[] {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return codeFiles(path)
    if (!/\.(ts|vue|mjs|cjs)$/.test(entry.name)) return []
    if (/\.test\.ts$|\.fixtures\.ts$/.test(entry.name)) return []
    return [path]
  })
}

const sources = codeDirectories
  .flatMap(codeFiles)
  .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }))

/** The files of the application's code that contain the text. */
const containing = (text: string | RegExp) =>
  sources
    .filter(({ text: source }) =>
      typeof text === 'string' ? source.includes(text) : text.test(source),
    )
    .map(({ path }) => path)

describe('the texts of the old way are gone from the application (T10-AC08)', () => {
  // T7-R04: the Profile's labels of waiting and its messages chosen by the
  // cause of an AI failure.
  const profile = [
    'Czeka na przygotowanie propozycji',
    'Czeka na środki w budżecie',
    'Nie wiadomo, jak zakończyło się przygotowanie propozycji',
    'AI odmówiło przygotowania propozycji',
    'AI nie ukończyło odpowiedzi',
    'AI nie zwróciło jednej kompletnej propozycji',
    'Worker utracił prawo do publikacji',
    'Nie udało się połączyć z AI lub odczytać odpowiedzi',
  ]
  // T8-R04: the offer views' states of waiting and of a send or cost to
  // check, and the messages chosen by the cause of an AI failure.
  const matching = [
    'Czeka na budżet',
    'Wysyłka lub koszt wymagają sprawdzenia',
    'Grupa czeka na budżet.',
    'Nie wiadomo, jak zakończyła się ocena',
    '[AI: ',
    'Pobierz archiwum całej partii',
  ]
  // T9-R03: the company view's states of waiting and of an interrupted
  // research, and its amounts.
  const companies = [
    'Czeka na dostępny budżet',
    'Czeka na wykonanie',
    'Przerwano — koszt wymaga sprawdzenia',
    'Usługa researchu zwróciła błąd HTTP',
    'Rezerwacja kosztu pozostaje zajęta',
    'Konserwatywne rozliczenie',
    'Raport gotowy, ale koszt nie został potwierdzony',
  ]

  it.each([...profile, ...matching, ...companies])('has no %j', (text) => {
    expect(containing(text)).toEqual([])
  })

  // The offer views' "W kolejce" is gone (T8-R04); the text stays only as
  // the sync state of the page "Synchronizacje" (epic nq3, T1-R07) and in
  // its summary strip's "W kolejce lub w toku" (T4-R01).
  // ASSUMPTION(oferty-pracy-nq3.1/ASM-1): T10-AC08 checks the texts T8-R04
  // removes from the offer views; the sync state label is not one of them.
  it('keeps "W kolejce" only as the sync state label and in the summary strip of the Sources module', () => {
    expect(containing('W kolejce')).toEqual([
      'modules/sources/domain/source-health-view.ts',
      'modules/sources/domain/sync-history-view.ts',
    ])
  })

  it('keeps "Wymaga sprawdzenia" only as the label of the Profile', () => {
    expect(containing('Wymaga sprawdzenia')).toEqual([
      'modules/profile/domain/import-status.ts',
    ])
  })

  it('has no option "Wymaga sprawdzenia" in the filter of the offer list', () => {
    const page = readFileSync(join(root, 'app/pages/offers.vue'), 'utf8')
    expect(page).not.toMatch(/<option[^>]*>Wymaga sprawdzenia</)
  })
})

describe('the old contract, provider batches and the result check are gone (T10-AC04, T10-AC08)', () => {
  const identifiers = [
    'requestExecution',
    'requestExecutionGroup',
    'checkExecution',
    'readLatestExecution',
    'readExecutionHistory',
    'readExecutionArchive',
    'countActiveExecutions',
    'readReservation',
    'readBudgetHistory',
    'registerResultReceiver',
    'ResultReceiver',
    'executionCauses',
    'executionStates',
    'paidExecutionJob',
    'localExecutionJob',
    'runExecution',
    'endFailedExecution',
    'requestUnfinishedExecutions',
    'fundWaitingExecutions',
    'advanceSentBatches',
    'cleanUpEndedBatches',
    'openAiBatch',
    'parseResult',
    'clientSettings',
  ]
  it.each(identifiers)('no code names %s', (name) => {
    expect(containing(new RegExp(`\\b${name}\\b`))).toEqual([])
  })

  it('no code reads the earlier records or sends to the queues of the old way', () => {
    for (const table of [
      'ai_executions',
      'ai_attempts',
      'ai_execution_artifacts',
      'matching_batch_artifacts',
      'archive_ai_executions',
      'archive_ai_attempts',
      'archive_ai_execution_artifacts',
      'archive_matching_batch_artifacts',
    ])
      expect(containing(new RegExp(`(?<![a-z_])${table}\\b`))).toEqual([])
    expect(containing(/ai-execution-(paid|local)/)).toEqual([])
  })
})

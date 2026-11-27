import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The logic of the offer page (T5 of epic nq3, task oferty-pracy-nq3.5)
 * as a reading of its code, since the sandbox has no browser: the page sets
 * no timer that reloads the list, also while an AI assessment waits
 * (T5-AC03), and "Odśwież widok" reads the offers again (T5-AC01).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const offersPage = read('app/pages/offers.vue')
const timer = /\b(setInterval|setTimeout|useIntervalFn|useTimeoutFn)\b/

/** The components of the folder app/components the page renders. */
const components = [...offersPage.matchAll(/<([A-Z][A-Za-z]+)/g)]
  .map(([, name]) => `app/components/${name}.vue`)
  .filter(
    (path, i, all) => all.indexOf(path) === i && existsSync(join(root, path)),
  )

describe('the offer page reloads the list only on request (T5-R05)', () => {
  it('sets no timer, so nothing reloads the list by itself, also with an AI assessment waiting (T5-AC03)', () => {
    expect(offersPage).not.toMatch(timer)
    expect(offersPage).not.toMatch(/matching\.pending/)
    expect(offersPage).not.toMatch(/\bonMounted\b/)
  })

  // ASSUMPTION(oferty-pracy-nq3.5/ASM-1): the details' section
  // "Dopasowanie do profilu" keeps re-reading the open offer's own
  // assessment while it waits; it never reloads the list.
  it('leaves a timer only in the open offer’s assessment section, which reads that assessment alone (ASM-1)', () => {
    const withTimer = components.filter((path) => timer.test(read(path)))
    expect(withTimer).toEqual(['app/components/OfferMatching.vue'])
    const matching = read('app/components/OfferMatching.vue')
    // The one read the timer's refresh repeats is the open offer's
    // assessment.
    const reads = [...matching.matchAll(/useFetch\(\s*\(\) => `([^`]*)`/g)]
    expect(reads.map(([, route]) => route)).toEqual([
      '/api/offers/${encodeURIComponent(props.offerId)}/matching',
    ])
    expect(matching.match(/\buseFetch\(/g)).toHaveLength(1)
    // The timer reads the section's own assessment and tells the page
    // nothing, so the list is not read again.
    const tick = matching.split('setInterval(')[1]!.split('}, 5000)')[0]!
    expect(tick).toContain('refresh()')
    expect(tick).not.toContain("emit('updated')")
  })

  it('has "Odśwież widok" read the offers again (T5-AC01)', () => {
    const button = offersPage
      .split('data-testid="offers-refresh"')[1]!
      .split('</UButton')[0]!
    expect(button).toContain('@click="refresh()"')
    expect(button).toContain('Odśwież widok')
    expect(offersPage).toMatch(
      /const \{ data, status, error, refresh \} = await useFetch\('\/api\/offers',/,
    )
  })
})

describe('the stage filter of the offer page (lq3 T3-R03, T3-R04)', () => {
  it('applies a changed stage choice through the address builder, which keeps no page, so the list shows page 1 (T3-AC03)', () => {
    const filter = offersPage.split('<MultiChoiceFilter')[1]!.split('/>')[0]!
    expect(filter).toContain('label="Etap aplikacji"')
    expect(filter).toContain(':options="stageFilterOptions"')
    expect(filter).toContain(':chosen="chosenStages"')
    expect(filter).toContain('@change="changeStages"')
    expect(offersPage).toMatch(
      /function changeStages\(stages: StageFilterValue\[\]\) \{\s*void show\(stages\)\s*\}/,
    )
    const show = offersPage.split('async function show(')[1]!.split('\n}')[0]!
    expect(show).toContain('offerFilterQuery(')
    expect(show).toContain('{ ...form, stage: stages }')
    expect(show).toContain("navigateTo({ path: '/offers', query })")
    // The form holds no page, so the built address has none.
    const keys = offersPage.split('const keys = [')[1]!.split(']')[0]!
    expect(keys).not.toContain("'page'")
    expect(offersPage).toContain(
      'const chosenStages = computed(() => readStageFilter(route.query.stage))',
    )
  })

  it('shows each offer’s stage icon in its row, without a stage field (T3-AC01)', () => {
    const row = offersPage
      .split('<td class="offer-main">')[1]!
      .split('</td>')[0]!
    expect(row).toContain('<OfferStageIcon :stage="offer.stage" />')
    expect(row).not.toContain('ApplicationStageField')
    expect(row).not.toContain('OfferApplicationStage')
  })
})

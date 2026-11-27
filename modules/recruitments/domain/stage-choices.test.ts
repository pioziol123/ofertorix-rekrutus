import { describe, expect, it } from 'vitest'
import {
  applicationsAddress,
  changeStageChoice,
  choiceStages,
  readApplicationsQuery,
  stageChoiceLabels,
  stageChoices,
  type ApplicationsQuery,
} from './stage-choices.ts'
import { stageMarks } from './stage-marks.ts'
import { stages } from './stages.ts'

/**
 * The stage switch and the address of Moja lista (task oferty-pracy-lq3.2,
 * T2-R03, T2-R05, T2-R06).
 */
const defaults: ApplicationsQuery = { stage: 'active', page: 1, size: 20 }

describe('the stage switch of Moja lista (T2-AC03)', () => {
  it('offers Aktywne, Wszystkie and the three stages, by their labels', () => {
    expect(stageChoices.map((choice) => stageChoiceLabels[choice])).toEqual([
      'Aktywne',
      'Wszystkie',
      'Do rozważenia',
      'CV wysłane',
      'Odrzucone',
    ])
  })

  it('lists exactly the stages of each choice and "Zdjęta z listy" under none', () => {
    expect(choiceStages('active')).toEqual(['to_consider', 'cv_sent'])
    expect(choiceStages('all')).toEqual(['to_consider', 'cv_sent', 'rejected'])
    expect(choiceStages('to_consider')).toEqual(['to_consider'])
    expect(choiceStages('cv_sent')).toEqual(['cv_sent'])
    expect(choiceStages('rejected')).toEqual(['rejected'])
    for (const choice of stageChoices)
      expect(choiceStages(choice)).not.toContain('removed')
  })
})

describe('the address of Moja lista (T2-AC05)', () => {
  it('gives Aktywne, page 1 and 20 per page without an address', () => {
    expect(readApplicationsQuery({})).toEqual(defaults)
    expect(applicationsAddress(defaults)).toEqual({})
  })

  it('reads 10, 20, 50 and 100 per page', () => {
    for (const size of [10, 20, 50, 100])
      expect(readApplicationsQuery({ size: String(size) }).size).toBe(size)
  })

  it('replaces an unknown stage choice and 30 per page by their defaults, keeps page 999 for the read to clamp, and gives page 1 for page 0', () => {
    expect(
      readApplicationsQuery({ stage: 'removed', size: '30', page: '999' }),
    ).toEqual({ stage: 'active', page: 999, size: 20 })
    expect(readApplicationsQuery({ stage: 'hired' }).stage).toBe('active')
    expect(readApplicationsQuery({ page: '0' }).page).toBe(1)
    expect(readApplicationsQuery({ page: '-3' }).page).toBe(1)
    expect(readApplicationsQuery({ page: 'x', size: ['10', '50'] })).toEqual(
      defaults,
    )
  })

  it('gives back the same view for an address with a choice, page, size and an open application', () => {
    const query: ApplicationsQuery = { stage: 'rejected', page: 3, size: 50 }
    const address = applicationsAddress(query, 'an-offer')
    expect(address).toEqual({
      stage: 'rejected',
      page: '3',
      size: '50',
      offer: 'an-offer',
    })
    expect(readApplicationsQuery(address)).toEqual(query)
  })

  it('goes back to page 1 when the stage choice changes, and keeps the page for the same choice', () => {
    const query: ApplicationsQuery = { stage: 'active', page: 4, size: 10 }
    expect(changeStageChoice(query, 'all')).toEqual({
      stage: 'all',
      page: 1,
      size: 10,
    })
    expect(changeStageChoice(query, 'active')).toBe(query)
  })
})

describe('the icons of the stages (T2-R13, T3-R01)', () => {
  it('gives every stage its own icon and colour', () => {
    const icons = stages.map((stage) => stageMarks[stage].paths.join(' '))
    const colours = stages.map((stage) => stageMarks[stage].colour)
    expect(new Set(icons).size).toBe(stages.length)
    expect(new Set(colours).size).toBe(stages.length)
  })
})

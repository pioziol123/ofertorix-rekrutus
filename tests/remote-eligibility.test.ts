import { describe, expect, it } from 'vitest'
import {
  assessRemoteEligibility,
  remoteEligibilityLabel,
} from '../lib/sources/remote-eligibility.ts'
import { projectOffer } from '../modules/offers/index.ts'

describe('evidence for remote work from Poland', () => {
  it.each([
    'Work from anywhere.',
    'Work from anywhere in the world.',
    'Work from anywhere in Poland.',
    'Senior PHP developer — Remote Europe',
    'Remote within the EU',
    'Remote from Poland',
    'Praca zdalna z Polski',
    '<p>Remote worldwide</p>',
  ])('allows explicit inclusive scope: %s', (description) => {
    const assessment = assessRemoteEligibility({ description, is_remote: true })
    expect(assessment.status).toBe('allowed')
    expect(assessment.evidence).not.toHaveLength(0)
    expect(remoteEligibilityLabel(assessment)).toContain(
      'potwierdzona w opisie',
    )
  })
  it.each([
    'Remote, US only',
    'You must be based in India',
    'Only applicants from Canada',
    'This is a hybrid role',
    'No remote work',
  ])('retains a concrete restriction: %s', (description) => {
    const assessment = assessRemoteEligibility({ description, is_remote: true })
    expect(assessment.status).toBe('excluded')
    expect(assessment.evidence).toContain(description)
  })
  it.each([
    'Europe is not included in remote work',
    'This role is not US-only',
    'Candidates based in Poland',
    'Remote worldwide except Poland',
    'Remote, subject to local eligibility',
    'Office based in Poland',
    '',
  ])(
    'does not infer permission from incomplete or negated text: %s',
    (description) => {
      expect(
        assessRemoteEligibility({ description, is_remote: true }).status,
      ).toBe('unknown')
    },
  )
  it('does not use the remote flag or country as proof of Polish eligibility', () => {
    for (const country of ['Poland', 'India', 'USA']) {
      const view = projectOffer({
        source: 'naukri',
        payload: {
          title: 'PHP engineer',
          isRemote: true,
          locations: [country],
        },
      })
      expect(view).toMatchObject({
        remoteEligibility: { status: 'unknown', evidence: [] },
      })
    }
  })
  it('exposes conflicting location declarations rather than treating one as definitive', () => {
    const assessment = assessRemoteEligibility({
      description: 'Remote worldwide. US only.',
      is_remote: true,
    })
    expect(assessment).toMatchObject({
      status: 'unknown',
      evidence: ['US only', 'Remote worldwide'],
    })
    expect(assessment.reason).toContain('Sprzeczne')
  })
  it('preserves a source nonremote flag, including its conflict with a global declaration', () => {
    expect(assessRemoteEligibility({ is_remote: false }).status).toBe(
      'excluded',
    )
    expect(
      assessRemoteEligibility({
        description: 'Work from anywhere',
        is_remote: false,
      }),
    ).toMatchObject({
      status: 'unknown',
      evidence: [
        'Źródło oznaczyło ofertę jako niezdalną.',
        'Work from anywhere',
      ],
    })
  })
  it('reassesses historical payloads from source evidence instead of trusting an old stored assessment', () => {
    const view = projectOffer({
      source: 'zip_recruiter',
      payload: {
        title: 'PHP engineer',
        isRemote: true,
        remoteEligibility: { status: 'allowed' },
        sourceRecord: { description: 'Remote, US only', is_remote: true },
      },
    })
    expect(view).toMatchObject({
      remoteEligibility: { status: 'excluded', evidence: ['Remote, US only'] },
    })
    expect(
      projectOffer({
        source: 'solid-jobs',
        payload: { title: 'PHP engineer', description: 'Work from anywhere' },
      }),
    ).not.toHaveProperty('remoteEligibility')
  })
  it.each(['Work from anywhere in Germany', 'Remote anywhere in India'])(
    'does not turn a country-limited anywhere declaration into global permission: %s',
    (description) => {
      expect(
        assessRemoteEligibility({ description, is_remote: true }).status,
      ).not.toBe('allowed')
    },
  )
})

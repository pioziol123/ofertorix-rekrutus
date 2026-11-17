import { describe, expect, it } from 'vitest'
import { plainDescription, projectSourceAd, safeUrl } from './ad-projection.ts'

const row = (payload: Record<string, unknown> = {}, id = 'a') => ({
  id,
  payload,
  first_seen_at: '2026-10-01T10:00:00Z',
  last_seen_at: '2026-10-02T10:00:00Z',
})
const offer = (payload: Record<string, unknown> = {}, id = 'a') =>
  projectSourceAd(row(payload, id))

describe('offer projection and safe source content', () => {
  it('preserves missing conditions without fabricating salary, hours or remote work', () => {
    const result = offer({
      title: 'PHP',
      unknownField: 'future',
      skills: [
        null,
        {},
        { name: ' PHP ' },
        { name: 'Redis', level: 'NiceToHave' },
      ],
    })
    expect(result).toMatchObject({
      title: 'PHP',
      salaries: [],
      locations: [],
      hours: null,
      seniority: null,
      mode: null,
      published: null,
      validTo: null,
    })
    expect(result.skills).toEqual([
      { name: 'PHP', optional: null },
      { name: 'Redis', optional: true },
    ])
  })
  it('separates disappearance from explicit expiration', () => {
    const result = projectSourceAd(
      { ...row(), availability: 'available', valid_to: '2020-01-01' },
      new Date('2026-01-01'),
    )
    expect(result.availability).toBe('available')
    expect(result.expired).toBe(true)
  })
  it('strips executable markup, preserves paragraphs and decodes common entities', () => {
    expect(
      plainDescription(
        '<p>PHP &amp; SQL</p><script>alert(1)</script><style>body{}</style><p>Remote<br>Team</p>',
      ),
    ).toBe('PHP & SQL\nRemote\nTeam')
    expect(plainDescription(null)).toBe('')
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/relative',
    'file:///etc/passwd',
  ])('rejects unsafe source links: %s', (url) =>
    expect(safeUrl(url)).toBeNull(),
  )
  it('allows absolute source links over HTTP and HTTPS', () => {
    expect(safeUrl('https://solid.jobs/offer/1')).toBe(
      'https://solid.jobs/offer/1',
    )
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
  })
})

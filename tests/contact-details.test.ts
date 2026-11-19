import { describe, expect, it } from 'vitest'
import { scrubContacts } from '../lib/contact-details.ts'

describe('contact redaction before AI input', () => {
  it('removes obvious contact data before AI input', () => {
    const text = scrubContacts(
      'PHP developer\nmail@example.com\n+48 123 456 789\nAddress: home\nVue',
    )
    expect(text).not.toContain('mail@example.com')
    expect(text).not.toContain('123 456')
    expect(text).not.toContain('home')
    expect(text).toContain('PHP developer')
    expect(text).toContain('Vue')
  })
  it('preserves numbered companies and employment dates in a multiline CV', () => {
    const career = [
      'Software 24',
      '06.2015-07.2016',
      'Junior PHP Developer',
      'Studio 360 08.2016 – 12.2020',
      'Backend Developer',
      'Żółw123456789',
      '01.2021 — obecnie',
      'Senior PHP Developer',
    ].join('\n')
    const text = [
      'E-mail: person@example.com',
      'Telefon: +48 123 456 789',
      'Adres zamieszkania: Testowa 1',
      career,
    ].join('\n')
    const cleaned = scrubContacts(text)
    expect(cleaned).toBe(
      [
        'E-mail: [e-mail usunięty]',
        'Telefon: [numer usunięty]',
        '[dane osobowe usunięte]',
        career,
      ].join('\n'),
    )
    expect(scrubContacts(cleaned)).toBe(cleaned)
  })
  it.each([
    '06.2015-07.2016',
    '06.2015 – 07.2016',
    '06/2015 — 07/2016',
    '06-2015 - 07-2016',
    '01.06.2015-31.07.2016',
    '1/6/2015 – 31/7/2016',
    '01-06-2015 — 31-07-2016',
    '2015-06-01 - 2016-07-31',
    '2015/06/01 – 2016/07/31',
  ])('preserves employment date range %j next to a company number', (dates) => {
    const text = `Studio 360 ${dates}\nPHP 8.4, PostgreSQL 16`
    expect(scrubContacts(text)).toBe(text)
  })
  it.each([
    '123456789',
    '123 456 789',
    '123.456.789',
    '123-456-789',
    '+48 123 456 789',
    '+48 (123) 456-789',
    '0048 123 456 789',
    '+1 212 555 0123',
    '+48\t123\t456\t789',
  ])(
    'removes a phone number %j without changing neighboring dates',
    (phone) => {
      expect(scrubContacts(`06.2015\nTel: ${phone}\n07.2016`)).toBe(
        '06.2015\nTel: [numer usunięty]\n07.2016',
      )
    },
  )
  it.each(['\n', '\r\n'])(
    'does not join numbers across %j line breaks',
    (newline) => {
      const text = ['Studio 24', '12345678', '9', '123 456 789', '42'].join(
        newline,
      )
      expect(scrubContacts(text)).toBe(
        ['Studio 24', '12345678', '9', '[numer usunięty]', '42'].join(newline),
      )
    },
  )
})

describe('contact redaction with long uninterrupted source text', () => {
  it('preserves a long non-contact token and still removes ordinary emails', () => {
    const token = 'x'.repeat(200000)
    const result = scrubContacts(
      `${token}\nContact first.last+jobs@example.com and recruiter@example.org`,
    )
    expect(result).toBe(
      `${token}\nContact [e-mail usunięty] and [e-mail usunięty]`,
    )
    expect(scrubContacts(result)).toBe(result)
  })
})

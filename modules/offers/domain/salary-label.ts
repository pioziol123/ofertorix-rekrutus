import type { Salary } from '../offer-view.ts'

/**
 * The text of a salary range as the offer list shows it, so every page that
 * shows an offer's salary shows the same text (lq3 T2-R09). Pure.
 */

/** The period of an amount, as "mies." for a month. */
export const salaryPeriodLabel = (value: string | null) =>
  ({
    Month: 'mies.',
    Year: 'rok',
    Day: 'dzień',
    Hour: 'godz.',
    Fixed: 'projekt',
  })[value ?? ''] ??
  value ??
  '?'

/** The amounts, currency and period, as "15 000 – 20 000 PLN / mies.". */
export function salaryLabel(salary: Salary): string {
  const amount = (n: number | null) =>
    n === null ? '?' : new Intl.NumberFormat('pl-PL').format(n)
  return `${amount(salary.from)} – ${amount(salary.to)} ${salary.currency ?? '?'} / ${salaryPeriodLabel(salary.period)}`
}

/** Who stated the amount, or nothing when the source does not say. */
export const salaryOriginLabel = (salary: Salary): string =>
  salary.origin === 'portal_estimate'
    ? 'Szacunek portalu — kwota niepotwierdzona przez pracodawcę'
    : salary.origin === 'unknown'
      ? 'Pochodzenie kwoty nieustalone'
      : salary.origin === 'employer'
        ? 'Kwota podana przez pracodawcę'
        : ''

/** The contract and whether the amount is net or gross. */
export const salaryTermsLabel = (salary: Salary): string =>
  `${salary.contract ?? 'Kontrakt niepodany'}${
    salary.contract === 'B2B'
      ? ' · netto + VAT'
      : salary.contract === 'UoP'
        ? ' · brutto'
        : ''
  }`

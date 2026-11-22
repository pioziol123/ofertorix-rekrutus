/**
 * The AI budget as the panel shows and changes it (task oferty-pracy-sq2.14,
 * T13 of epic sq2). Browser-safe: views read it through `view.ts`; the
 * server's `assignments/read-budget.ts` returns these shapes and
 * `assignments/set-budget-limits.ts` checks an amount with `limitAmount`.
 * Amounts are złoty as decimal strings with six decimals.
 */

/**
 * The current month's budget (T13-R01). Its charge is `spent`,
 * `running`, `unknownCost` and `carriedHeld` together; `spent` and the held
 * amounts (`running`, `unknownCost`, `carriedHeld`) are the "Rozliczone"
 * and "Zarezerwowane" of the profile page's budget card.
 */
export type CurrentMonthBudget = {
  /** The month in the form year-month, in Polish time. */
  month: string
  limit: string
  /**
   * The known actual costs: of the month's operations and those carried
   * from the earlier records (`carriedSettled`).
   * ASSUMPTION(oferty-pracy-sq2.14/ASM-1)
   */
  spent: string
  /** The potential costs of the month's running operations. */
  running: string
  /** The potential costs the month's operations of unknown cost charge. */
  unknownCost: string
  /** How many of the month's operations have an unknown cost. */
  unknownCount: number
  /**
   * The parts carried from before the deployment (T10-R01): the settled
   * part, within `spent`, and the held part, the reservations of earlier
   * work, charged beside the held amounts of operations.
   * ASSUMPTION(oferty-pracy-sq2.14/ASM-1)
   */
  carriedSettled: string
  carriedHeld: string
  /** The month's charge. */
  charge: string
  /**
   * The room an operation's start checks (solution design T3, "Contract:
   * room in the budget"): the limit less the charge, zero when the charge
   * is higher.
   */
  remaining: string
}

/** An earlier month with its limit and charge (T13-R01). */
export type EarlierMonthBudget = {
  month: string
  limit: string
  charge: string
}

/** The panel's budget view (T13-R01) and the default limit (T13-R03). */
export type AiBudget = {
  current: CurrentMonthBudget
  /** Earlier months with a budget, newest first. */
  earlier: EarlierMonthBudget[]
  /** The limit a new month starts with. */
  defaultLimit: string
}

/** Whether an amount is above zero, for showing a part only then. */
export const aboveZero = (amount: string) => /[1-9]/.test(amount)

/**
 * The most a limit may have before the decimal point: the month's and the
 * default limit are stored with ten. ASSUMPTION(oferty-pracy-sq2.14/ASM-2)
 */
const maxWholeDigits = 10

/** The messages of a refused amount (T13-R04). */
export const limitAmountMessages = {
  // ASSUMPTION(oferty-pracy-sq2.14/ASM-2): the example reads a comma.
  notNumber: 'Podaj kwotę w złotych, na przykład 150 albo 150,50.',
  negative: 'Limit nie może być mniejszy od zera.',
  decimals: 'Kwota może mieć najwyżej dwa miejsca po przecinku.',
  // ASSUMPTION(oferty-pracy-sq2.14/ASM-2)
  tooLarge: 'Kwota jest za duża.',
} as const

/**
 * A limit the owner typed (T13-R02, T13-R03, T13-R04): zero or more złoty
 * with at most two decimal places, the decimal part after a comma or a
 * point. Returns the amount as a decimal string with a point, or the
 * message it is refused with.
 */
export function limitAmount(
  typed: string,
): { amount: string } | { refused: string } {
  const text = typed.trim()
  // ASSUMPTION(oferty-pracy-sq2.14/ASM-2): a comma or a point.
  const number = /^(-)?\s*(\d+)(?:[.,](\d+))?$/.exec(text)
  if (!number) return { refused: limitAmountMessages.notNumber }
  const [, minus, whole = '', fraction = ''] = number
  if (minus && /[1-9]/.test(whole + fraction))
    return { refused: limitAmountMessages.negative }
  if (fraction.length > 2) return { refused: limitAmountMessages.decimals }
  const digits = whole.replace(/^0+(?=\d)/, '')
  if (digits.length > maxWholeDigits)
    return { refused: limitAmountMessages.tooLarge }
  return { amount: fraction ? `${digits}.${fraction}` : digits }
}

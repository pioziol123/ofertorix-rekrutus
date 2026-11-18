/**
 * Removing contact details from text: phone numbers, e-mail addresses and
 * lines with personal data. A pure function of the shared infrastructure,
 * used wherever text leaves the application, e.g. CV text for a proposal or
 * profile and ad content for an assessment.
 */
function scrubPhones(text: string): string {
  // Dates are common in CVs. Keep them separate so a phone match cannot
  // consume a date range or join it to a number in the preceding company name.
  const dates =
    /(?<![\p{L}\p{N}])((?:\d{4}[-/]\d{2}[-/]\d{2}|(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-]\d{4}|(?:0?[1-9]|1[0-2])[./-]\d{4}))(?![\p{L}\p{N}])/gu
  return text
    .split(dates)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /(?<![\p{L}\p{N}])\+?\d(?:[\t ().-]*\d){8,14}(?![\p{L}\p{N}])/gu,
            '[numer usunięty]',
          ),
    )
    .join('')
}
export function scrubContacts(text: string): string {
  return scrubPhones(text)
    .replace(
      /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[e-mail usunięty]',
    )
    .replace(
      /^.*(?:adres zamieszkania|address:|data urodzenia|date of birth|pesel).*$/gim,
      '[dane osobowe usunięte]',
    )
}

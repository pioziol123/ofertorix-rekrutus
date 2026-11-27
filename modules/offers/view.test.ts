import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Every file and package the entry reaches through runtime imports. */
function runtimeImports(entry: string): {
  files: string[]
  packages: string[]
} {
  const files = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    const source = readFileSync(file, 'utf8')
    for (const [, typeOnly, specifier] of source.matchAll(
      /^(?:import|export)\s+(type\s+)?[^'"]*?from\s+'([^']+)'/gm,
    )) {
      if (typeOnly) continue
      if (!specifier!.startsWith('.')) packages.add(specifier!)
      else visit(resolve(dirname(file), specifier!))
    }
  }
  visit(entry)
  return { files: [...files], packages: [...packages] }
}

describe('public entry of Offers for views', () => {
  it('reaches no server code, so the offer page bundle stays browser-safe', () => {
    const entry = fileURLToPath(new URL('./view.ts', import.meta.url))
    const { files, packages } = runtimeImports(entry)
    expect(packages).toEqual([])
    expect(files.map((f) => f.replace(dirname(entry), '.')).sort()).toEqual([
      './domain/filter-form.ts',
      './domain/salary-label.ts',
      './view.ts',
    ])
  })
})

describe('the salary text the pages share (lq3 T2-R09)', () => {
  it('shows the range, the period, the origin and the terms as the offer list does', async () => {
    const { salaryLabel, salaryOriginLabel, salaryTermsLabel } =
      await import('./view.ts')
    const salary = {
      from: 15000,
      to: 20000,
      currency: 'PLN',
      period: 'Month',
      contract: 'B2B',
      origin: 'employer' as const,
    }
    expect(salaryLabel(salary).replace(/\s/g, ' ')).toBe(
      '15 000 – 20 000 PLN / mies.',
    )
    expect(salaryOriginLabel(salary)).toBe('Kwota podana przez pracodawcę')
    expect(salaryTermsLabel(salary)).toBe('B2B · netto + VAT')
    expect(salaryTermsLabel({ ...salary, contract: 'UoP' })).toBe(
      'UoP · brutto',
    )
    expect(
      salaryLabel({ ...salary, from: null, currency: null, period: null }),
    ).toBe(`? – 20${'\u00a0'}000 ? / ?`)
    expect(salaryTermsLabel({ ...salary, contract: null })).toBe(
      'Kontrakt niepodany',
    )
  })
})

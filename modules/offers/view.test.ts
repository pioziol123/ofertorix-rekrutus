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
      './view.ts',
    ])
  })
})

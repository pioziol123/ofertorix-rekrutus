import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import mammoth from 'mammoth'
const [kind, path] = process.argv.slice(2)
if (!path) throw new Error('Missing document path')
const bytes = await readFile(path)
let text = ''
if (kind === 'pdf') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const packageDir = dirname(
    createRequire(import.meta.url).resolve('pdfjs-dist/package.json'),
  )
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    verbosity: 0,
    standardFontDataUrl: join(packageDir, 'standard_fonts/'),
  })
  try {
    const document = await task.promise
    if (document.numPages > 30) throw new Error('Too many pages')
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      const content = await page.getTextContent()
      text +=
        content.items
          .filter((item) => 'str' in item)
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
          )
          .join('') + '\n'
      page.cleanup()
      if (text.length > 120000) throw new Error('Text too long')
    }
  } finally {
    await task.destroy()
  }
} else if (kind === 'docx') {
  text = (await mammoth.extractRawText({ buffer: bytes })).value
} else throw new Error('Unsupported document')
if (text.length > 120000) throw new Error('Text too long')
console.log(JSON.stringify({ text: text.trim() }))

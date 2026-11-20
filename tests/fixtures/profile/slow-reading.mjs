// Loaded into every process of the test worker through NODE_OPTIONS. It acts
// only in the CV text extraction helper process, and only for a document
// that holds the marker below: that reading takes 40 s, past the reading's
// 30 s limit, then fails. Bounded, so a helper left behind by a killed
// worker ends by itself.
import { readFileSync } from 'node:fs'

export const slowReadingMarker = 'SLOW-READING'

if (process.argv[1]?.endsWith('extract-cv.ts')) {
  const path = process.argv.at(-1)
  if (path && readFileSync(path).includes(slowReadingMarker)) {
    await new Promise((resolve) => setTimeout(resolve, 40_000))
    process.exit(1)
  }
}

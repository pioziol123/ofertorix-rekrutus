import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

try {
  writeFileSync(
    new URL('../.env', import.meta.url),
    `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nWEB_PORT=3100\n`,
    { flag: 'wx', mode: 0o600 },
  )
  console.info('Created local .env. Existing files are never overwritten.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.info('.env already exists; left unchanged.')
}

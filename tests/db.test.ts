import type pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import { closePool, db, setPool, transaction } from '../lib/db.ts'

// A pool double recording statements and how connections are released.
function fakePool(failOn: string[] = []) {
  const statements: string[] = []
  const releases: (Error | undefined)[] = []
  const client = {
    async query(text: string) {
      statements.push(text)
      if (failOn.includes(text)) throw new Error(`${text} failed`)
      return { rows: [] }
    },
    on() {},
    removeListener() {},
    release(error?: Error) {
      releases.push(error)
    },
  }
  const pool = {
    async connect() {
      return client
    },
    async query(text: string) {
      statements.push(`pool:${text}`)
      return { rows: [] }
    },
    async end() {},
  }
  return { pool: pool as unknown as pg.Pool, client, statements, releases }
}

afterEach(async () => {
  await closePool()
})

describe('shared transactions', () => {
  it('uses the pool outside a transaction and the connection inside it', async () => {
    const fake = fakePool()
    setPool(fake.pool)
    expect(db()).toBe(fake.pool)
    await transaction(async () => {
      expect(db()).toBe(fake.client)
      await db().query('SELECT 1')
    })
    expect(fake.statements).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
    expect(fake.releases).toEqual([undefined])
  })

  it('joins a running transaction without BEGIN or COMMIT', async () => {
    const fake = fakePool()
    setPool(fake.pool)
    const result = await transaction(() =>
      transaction(async () => {
        await db().query('SELECT 1')
        return 'inner'
      }),
    )
    expect(result).toBe('inner')
    expect(fake.statements).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
  })

  it('rolls back and rethrows the original error', async () => {
    const fake = fakePool()
    setPool(fake.pool)
    const failure = new Error('work failed')
    await expect(
      transaction(async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(fake.statements).toEqual(['BEGIN', 'ROLLBACK'])
    expect(fake.releases).toEqual([undefined])
  })

  it('keeps the original error when ROLLBACK fails and discards the connection', async () => {
    const fake = fakePool(['ROLLBACK'])
    setPool(fake.pool)
    const failure = new Error('work failed')
    await expect(
      transaction(async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(fake.releases).toHaveLength(1)
    expect(fake.releases[0]).toBeInstanceOf(Error)
  })

  it('rolls back when COMMIT fails', async () => {
    const fake = fakePool(['COMMIT'])
    setPool(fake.pool)
    await expect(transaction(async () => 'done')).rejects.toThrow(
      'COMMIT failed',
    )
    expect(fake.statements).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK'])
    expect(fake.releases).toEqual([undefined])
  })

  it('discards the connection when BEGIN fails', async () => {
    const fake = fakePool(['BEGIN'])
    setPool(fake.pool)
    let ran = false
    await expect(
      transaction(async () => {
        ran = true
      }),
    ).rejects.toThrow('BEGIN failed')
    expect(ran).toBe(false)
    expect(fake.releases[0]).toBeInstanceOf(Error)
  })

  it('refuses to replace the pool during a transaction', async () => {
    const fake = fakePool()
    setPool(fake.pool)
    await transaction(async () => {
      expect(() => setPool(fakePool().pool)).toThrow(/during a transaction/)
    })
    expect(() => setPool(fakePool().pool)).not.toThrow()
  })

  it('refuses work that outlives its transaction', async () => {
    const fake = fakePool()
    setPool(fake.pool)
    let late: Promise<unknown> | undefined
    await transaction(async () => {
      late = new Promise((resolve) => setTimeout(resolve, 10)).then(() => db())
    })
    await expect(late).rejects.toThrow(/already finished/)
  })
})

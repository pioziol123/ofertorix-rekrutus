import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closePool,
  db,
  getPool,
  queueDatabase,
  setPool,
  transaction,
} from '../lib/db.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('shared database access in isolated PostgreSQL schemas', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `db_test_${suffix}`
  const queueSchema = `db_queue_test_${suffix}`
  const queue = 'db-test'
  const maxConnections = 3
  let admin: Pool
  let observer: Pool
  let boss: PgBoss
  let statements: string[] = []

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    await admin.query(
      `CREATE TABLE ${schema}.notes (id text PRIMARY KEY, owner text NOT NULL)`,
    )
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: maxConnections,
    })
    // Records every statement sent by any pooled connection.
    pool.on('connect', (client: PoolClient) => {
      const query = client.query.bind(client) as (...args: unknown[]) => unknown
      ;(client as unknown as { query: unknown }).query = (
        ...args: unknown[]
      ) => {
        const text = args[0]
        statements.push(
          typeof text === 'string'
            ? text
            : String((text as { text?: string })?.text),
        )
        return query(...args)
      }
    })
    setPool(pool)
    observer = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 1,
    })
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: queueSchema,
    })
    boss.on('error', () => {})
    await boss.start()
    await boss.createQueue(queue)
  }, 30_000)

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${schema}.notes`)
    statements = []
  })

  afterAll(async () => {
    await boss?.stop()
    await closePool()
    await observer?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  })

  // Module operations: unaware of whether they run inside another operation.
  const writeNote = (id: string, owner: string) =>
    transaction(async () => {
      await db().query('INSERT INTO notes (id, owner) VALUES ($1, $2)', [
        id,
        owner,
      ])
    })
  const observed = async () =>
    (await observer.query('SELECT id FROM notes ORDER BY id')).rows.map(
      (row: { id: string }) => row.id,
    )

  it('rolls back a called operation when the calling operation fails after it (A13-AC01)', async () => {
    await expect(
      transaction(async () => {
        await writeNote('a', 'outer')
        await writeNote('b', 'inner')
        throw new Error('outer failed')
      }),
    ).rejects.toThrow('outer failed')
    expect(await observed()).toEqual([])
  })

  it('commits an operation called on its own (A13-AC02)', async () => {
    await writeNote('b', 'alone')
    expect(await observed()).toEqual(['b'])
  })

  it('hides the called operation from other database users until the outer operation ends (A13-AC03)', async () => {
    await transaction(async () => {
      await writeNote('b', 'inner')
      expect(await observed()).toEqual([])
      expect((await db().query('SELECT id FROM notes')).rows).toEqual([
        { id: 'b' },
      ])
    })
    expect(await observed()).toEqual(['b'])
    expect(statements.filter((text) => text === 'BEGIN')).toHaveLength(1)
    expect(statements.filter((text) => text === 'COMMIT')).toHaveLength(1)
  })

  it('keeps the changes of a parallel operation when another one fails (A13-AC04)', async () => {
    const results = await Promise.allSettled([
      transaction(async () => {
        await writeNote('a', 'failing')
        throw new Error('failed')
      }),
      transaction(async () => {
        await writeNote('b', 'succeeding')
      }),
    ])
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'fulfilled',
    ])
    expect(await observed()).toEqual(['b'])
  })

  it('queues background work only when the ordering operation commits (A13-AC05)', async () => {
    let rolledBack: string | null = null
    await expect(
      transaction(async () => {
        rolledBack = await boss.send(
          queue,
          { note: 'rolled back' },
          { db: queueDatabase },
        )
        throw new Error('ordering failed')
      }),
    ).rejects.toThrow('ordering failed')
    const committed = await transaction(() =>
      boss.send(queue, { note: 'committed' }, { db: queueDatabase }),
    )
    expect(rolledBack).toBeTruthy()
    expect(committed).toBeTruthy()
    expect(await boss.getJobById(queue, rolledBack!)).toBeNull()
    expect(await boss.getJobById(queue, committed!)).toMatchObject({
      id: committed,
      data: { note: 'committed' },
    })
  })

  it('serves an operation after more failed operations than allowed connections (A13-AC06)', async () => {
    const pool = getPool()
    for (let i = 0; i < maxConnections * 2; i++) {
      await expect(
        transaction(async () => {
          await writeNote(`failed-${i}`, 'failing')
          await db().query('SELECT * FROM missing_table')
        }),
      ).rejects.toThrow(/missing_table/)
      await expect(
        transaction(async () => {
          throw new Error('application failure')
        }),
      ).rejects.toThrow('application failure')
    }
    for (let i = 0; i < maxConnections + 1; i++) {
      // The connection dies inside the transaction, so ROLLBACK fails too;
      // the original error wins and the pool discards the connection.
      await expect(
        transaction(async () => {
          await db().query('SELECT pg_terminate_backend(pg_backend_pid())')
        }),
      ).rejects.toThrow(/terminat/)
    }
    await writeNote('ok', 'after failures')
    expect(await observed()).toEqual(['ok'])
    expect(pool.waitingCount).toBe(0)
    expect(pool.idleCount).toBe(pool.totalCount)
  })
})

import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'

/**
 * Shared database access. One `pg` pool per process; a query outside a
 * transaction borrows a connection for that query, a transaction for its
 * whole duration. The transaction context travels through AsyncLocalStorage,
 * so module code asks `db()` for an executor and never handles connections.
 * Rules: docs/architecture/moduly-i-zasady-kodu.md#dostęp-do-bazy-danych
 */

/** The `pg` query method, satisfied by both a pool and a pooled client. */
export type QueryExecutor = Pick<pg.Pool, 'query'>

type TransactionContext = { client: pg.PoolClient; active: boolean }

const context = new AsyncLocalStorage<TransactionContext>()
let processPool: pg.Pool | undefined
let openTransactions = 0

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  return new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
  })
}

/** The process pool, created lazily from the connection configuration. */
export function getPool(): pg.Pool {
  processPool ??= createPool()
  return processPool
}

/**
 * Replaces the process pool, e.g. with an isolated-schema pool in a test.
 * Call it before the first use; replacing it during a transaction is a
 * programming error.
 */
export function setPool(pool: pg.Pool): void {
  if (openTransactions > 0)
    throw new Error('Cannot replace the database pool during a transaction')
  processPool = pool
}

/** Ends the process pool, if one was created, and forgets it. */
export async function closePool(): Promise<void> {
  if (openTransactions > 0)
    throw new Error('Cannot close the database pool during a transaction')
  const pool = processPool
  processPool = undefined
  await pool?.end()
}

/**
 * The query executor for the current context: the transaction's connection
 * inside `transaction`, the process pool outside it.
 */
export function db(): QueryExecutor {
  const current = context.getStore()
  if (!current) return getPool()
  if (!current.active)
    throw new Error('The transaction of this context has already finished')
  return current.client
}

/**
 * Runs `work` in one transaction and returns its result. Inside a running
 * transaction `work` joins it without BEGIN or COMMIT. On error the whole
 * transaction rolls back and the original error is rethrown.
 */
export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  const current = context.getStore()
  if (current) {
    if (!current.active)
      throw new Error('The transaction of this context has already finished')
    return work()
  }
  const client = await getPool().connect()
  const own: TransactionContext = { client, active: true }
  openTransactions++
  let broken: Error | undefined
  // A connection lost while held must not crash the process; the pending
  // query rejects and the connection is discarded on release.
  const onError = (error: Error) => {
    broken = error
  }
  client.on('error', onError)
  try {
    try {
      await client.query('BEGIN')
    } catch (error) {
      broken = asError(error)
      throw error
    }
    try {
      const result = await context.run(own, work)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        // The original error matters; the connection is no longer trusted.
        broken = asError(rollbackError)
      }
      throw error
    }
  } finally {
    own.active = false
    openTransactions--
    client.removeListener('error', onError)
    client.release(broken)
  }
}

/**
 * Adapter for pg-boss' `db` option. Every call goes through `db()`, so a job
 * sent inside `transaction` commits or rolls back with it.
 */
export const queueDatabase = {
  async executeSql(text: string, values?: unknown[]) {
    return db().query(text, values)
  },
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

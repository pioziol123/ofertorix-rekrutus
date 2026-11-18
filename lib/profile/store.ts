import type { PoolClient } from 'pg'
// Legacy helper transaction still used by Matching and Companies; task
// oferty-pracy-0mq.18 replaces it with the shared transactional operation.
export async function tx<T>(
  client: PoolClient,
  run: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const value = await run()
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

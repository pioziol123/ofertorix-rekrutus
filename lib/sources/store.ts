import type { PoolClient } from 'pg'

export async function transaction<T>(
  client: PoolClient,
  action: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await action()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

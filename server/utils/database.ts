import { getPool } from '../../lib/db'
// The process pool shared by every route; transactions borrow from it.
export const database = getPool()

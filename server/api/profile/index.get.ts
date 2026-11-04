import { readProfile } from '../../../lib/profile/store'
import { aiConfiguration } from '../../../lib/profile/ai'
import { database } from '../../utils/database'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async () => {
  const profile = await readProfile(database)
  const imports = await database.query(
    'SELECT id,kind,original_name,status,error,created_at FROM profile_imports ORDER BY created_at DESC',
  )
  const budget =
    await database.query(`SELECT b.month,b.limit_pln,coalesce(sum(CASE WHEN a.state='settled' THEN a.actual_pln ELSE 0 END),0) AS spent,
 coalesce(sum(CASE WHEN a.state!='settled' THEN a.reserved_pln ELSE 0 END),0) AS reserved FROM ai_budget_months b LEFT JOIN ai_attempts a ON a.month=b.month GROUP BY b.month ORDER BY b.month DESC`)
  return {
    ...profile,
    imports: imports.rows,
    aiConfigured: aiConfiguration() !== null,
    budget: budget.rows,
  }
})

import { readProfile } from '../../../lib/profile/store'
import {
  listImports,
  proposalAiConfigured,
} from '../../../modules/profile/index'
import { database } from '../../utils/database'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async () => {
  const profile = await readProfile(database)
  const imports = await listImports()
  const budget =
    await database.query(`SELECT b.month,b.limit_pln,coalesce(sum(CASE WHEN a.state='settled' THEN a.actual_pln ELSE 0 END),0) AS spent,
 coalesce(sum(CASE WHEN a.state!='settled' THEN a.reserved_pln ELSE 0 END),0) AS reserved FROM ai_budget_months b LEFT JOIN ai_attempts a ON a.month=b.month GROUP BY b.month ORDER BY b.month DESC`)
  return {
    ...profile,
    imports,
    aiConfigured: proposalAiConfigured(),
    budget: budget.rows,
  }
})

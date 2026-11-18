import { readBudgetHistory } from '../../../modules/ai/index'
import {
  listImports,
  proposalAiConfigured,
  readProfile,
} from '../../../modules/profile/index'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async () => {
  const profile = await readProfile()
  const imports = await listImports()
  // ASSUMPTION(oferty-pracy-0mq.11/ASM-2): every month, in the former shape.
  const budget = await readBudgetHistory()
  return {
    ...profile,
    imports,
    aiConfigured: proposalAiConfigured(),
    budget: budget.map((period) => ({
      month: period.month,
      limit_pln: period.limit,
      spent: period.settled,
      reserved: period.reserved,
    })),
  }
})

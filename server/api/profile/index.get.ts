import { readMonthlyBudgets } from '../../../modules/ai/index'
import {
  listImports,
  proposalAiConfigured,
  readProfile,
} from '../../../modules/profile/index'
import { profileHandler } from '../../utils/profile'
export default profileHandler(async () => {
  const profile = await readProfile()
  const imports = await listImports()
  // The budget card reads every month through the budget read (T10-R06):
  // "Rozliczone" is the settled amount, "Zarezerwowane" the held one.
  // ASSUMPTION(oferty-pracy-0mq.11/ASM-2): every month, in the former shape.
  const budget = await readMonthlyBudgets()
  return {
    ...profile,
    imports,
    aiConfigured: proposalAiConfigured(),
    budget: budget.map((month) => ({
      month: month.month,
      limit_pln: month.limit,
      spent: month.settled,
      reserved: month.held,
    })),
  }
})

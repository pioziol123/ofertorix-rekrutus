import { randomUUID } from 'node:crypto'
import { transaction } from '../../lib/db.ts'
import { checkFirstMove, settleUnappliedMove } from './domain/moves.ts'
import type { Stage } from './domain/stages.ts'
import {
  findApplication,
  insertApplication,
  insertStageChange,
} from './infrastructure/persistence/applications.ts'
import type { ApplicationStage } from './application-stage.ts'

/**
 * Creates the application of an offer with its first stage (A-R01, A-R03),
 * for the Offers module's start application, which checks that the offer
 * exists (D5, D7). The application and its first history record carry
 * `now` (D11). When the offer already has an application, the same target
 * is done without a write (A-R13) and another one is refused as a stale
 * page (A-R07); two parallel creates of one offer meet the same way.
 */
export async function createApplication(command: {
  offerId: string
  target: Stage
  now: Date
}): Promise<ApplicationStage> {
  checkFirstMove(command.target)
  return transaction(async () => {
    const id = await insertApplication({
      id: randomUUID(),
      offerId: command.offerId,
      stage: command.target,
      at: command.now,
    })
    if (id) {
      await insertStageChange({
        id: randomUUID(),
        applicationId: id,
        stage: command.target,
        at: command.now,
      })
      return { stage: command.target, stageChangedAt: command.now }
    }
    const existing = await findApplication(command.offerId)
    settleUnappliedMove(existing?.stage ?? null, command.target)
    return { stage: existing!.stage, stageChangedAt: existing!.stageChangedAt }
  })
}

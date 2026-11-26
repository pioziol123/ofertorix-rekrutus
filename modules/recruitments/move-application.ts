import { randomUUID } from 'node:crypto'
import { transaction } from '../../lib/db.ts'
import { checkMove, settleUnappliedMove } from './domain/moves.ts'
import type { Stage } from './domain/stages.ts'
import {
  findApplication,
  insertStageChange,
  updateStageWhere,
} from './infrastructure/persistence/applications.ts'
import type { ApplicationStage } from './application-stage.ts'

/**
 * Moves an offer's application from the stage the page showed to the
 * chosen one (A-R03), recording the stage moment `now` (D11) and a history
 * record in one transaction (D1). A conditional update applies the move
 * only while the application is still in the expected stage, so of two
 * parallel moves from one stage only one applies. When it is not: no
 * application is refused as missing, an application already in the target
 * stage is done without a write (A-R13), and any other stage is refused as
 * a stale page (A-R07).
 */
export async function moveApplication(command: {
  offerId: string
  expected: Stage
  target: Stage
  now: Date
}): Promise<ApplicationStage> {
  checkMove(command.expected, command.target)
  return transaction(async () => {
    const id = await updateStageWhere({
      offerId: command.offerId,
      expected: command.expected,
      target: command.target,
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
    const current = await findApplication(command.offerId)
    settleUnappliedMove(current?.stage ?? null, command.target)
    return { stage: current!.stage, stageChangedAt: current!.stageChangedAt }
  })
}

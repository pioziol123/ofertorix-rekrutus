import type { AgentMaterial } from '../provider-adapter.ts'

/** A result of an assignment, as its receiver gets it. */
export type AssignmentResultDelivery = {
  assignmentId: string
  /** The content the executor returned, JSON when a format was given. */
  result: unknown
  /**
   * An agent assignment only: the materials its agent session gathered,
   * which the result refers to by id; empty when it gathered none.
   */
  materials?: AgentMaterial[]
}

/** The end of an assignment without a result; it carries no reason. */
export type AssignmentFailureDelivery = { assignmentId: string }

/**
 * The receiver of a requesting module (solution design of epic sq2, T6,
 * "Contract: receiver"; T6-R01): how the module learns of every end of its
 * assignments, a result or a failure. The AI module defines it; the
 * requesting module implements it in its integration layer and registers
 * it under its settings name in the shared registration of receivers.
 *
 * Each call runs inside the AI module's transaction that saves the
 * assignment's final status, so the receiver's own saves and that status
 * are committed together or not at all (T6-R02). A receiver that raises an
 * error rolls the transaction back: on a result, the assignment then fails
 * as "result not taken" and the failure entry is called (T6-R04); on a
 * failure, the end is not saved and is tried again later (T6-R05).
 *
 * Every receiver follows three rules (T6-R09), so that the call can later
 * become an event delivered through a queue without changing it:
 * 1. A call repeated with the same end changes nothing more than the first.
 * 2. It uses only what the call gives it and asks the AI module nothing.
 * 3. Its module does not assume that it learns of an end at the moment the
 *    end happened.
 *
 * Neither entry returns a value, and neither receives a cost, a cause or a
 * reason (ZA-R05).
 */
export type AssignmentReceiver = {
  receiveResult(delivery: AssignmentResultDelivery): Promise<void>
  receiveFailure(delivery: AssignmentFailureDelivery): Promise<void>
}

const receivers = new Map<string, AssignmentReceiver>()

/**
 * Registers the receiver of a settings name. The shared registration of
 * receivers calls it at the start of every process; a second registration
 * of a name throws, so two modules cannot share one.
 */
export function registerAssignmentReceiver(
  settingsName: string,
  receiver: AssignmentReceiver,
): void {
  if (receivers.has(settingsName))
    throw new Error(
      `A receiver of assignments is already registered for settings "${settingsName}"`,
    )
  receivers.set(settingsName, receiver)
}

/** The receiver of a settings name, when one is registered. */
export function assignmentReceiver(
  settingsName: string,
): AssignmentReceiver | undefined {
  return receivers.get(settingsName)
}

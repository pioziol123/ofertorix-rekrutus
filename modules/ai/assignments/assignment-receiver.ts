import type { AssignmentReceiver } from '../ports/assignment-receiver.ts'

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

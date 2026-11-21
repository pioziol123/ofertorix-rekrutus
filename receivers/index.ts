/**
 * The shared registration of the receivers of assignments (solution design
 * of epic sq2, T6, "Contract: receiver"): each requesting module's receiver
 * under its settings name, so that the end of an assignment reaches its
 * module in whichever process decides it. The web application, the
 * periodic process, the worker and each of its pool processes run it at
 * start. It registers no job handler and is separate from the module
 * plugins, which only the worker and its pool processes run.
 *
 * Each requesting module that moved to assignments has its receiver below,
 * imported from the module's public entry: the Profile from task
 * oferty-pracy-sq2.8; tasks oferty-pracy-sq2.9 and sq2.10 add Matching and
 * Companies. A second registration of a settings name throws at start.
 */
import {
  registerAssignmentReceiver,
  type AssignmentReceiver,
} from '../modules/ai/index.ts'
import {
  proposalAssignmentReceiver,
  proposalSettingsKey,
} from '../modules/profile/index.ts'

const receivers: Readonly<Record<string, AssignmentReceiver>> = {
  [proposalSettingsKey]: proposalAssignmentReceiver,
}

let registered = false

/**
 * Registers every receiver once in the process; a later call in the same
 * process, e.g. the plugins index run again in a test, does nothing.
 */
export function registerAssignmentReceivers(): void {
  if (registered) return
  registered = true
  for (const [settingsName, receiver] of Object.entries(receivers))
    registerAssignmentReceiver(settingsName, receiver)
}

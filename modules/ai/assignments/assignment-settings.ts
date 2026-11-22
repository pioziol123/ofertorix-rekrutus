/**
 * The settings of requesting modules for assignments, one entry per
 * settings name: the executor, its parameters and the requesting module's
 * display name for the owner. A requesting module defines its name; the AI
 * module keeps and validates the entry. The object is data: no code of
 * assignments depends on a name's value, and the names appear only here.
 * Fixed in code; how a requesting module's preferences choose an executor
 * belongs to epic oferty-pracy-334.
 *
 * The Profile prepares its proposals (task oferty-pracy-sq2.8), Matching
 * assesses offers (task oferty-pracy-sq2.9) and Companies research
 * companies (task oferty-pracy-sq2.10) through assignments, all on the paid
 * executor.
 */
export const assignmentSettings: Readonly<Record<string, unknown>> = {
  profile: {
    executor: 'openai',
    parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
    requestingModule: 'Profil',
  },
  matching: {
    executor: 'openai',
    parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
    requestingModule: 'Dopasowanie',
  },
  research: {
    executor: 'openai',
    parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
    requestingModule: 'Firmy',
  },
}

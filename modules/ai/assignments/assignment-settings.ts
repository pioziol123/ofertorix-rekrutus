/**
 * The settings of requesting modules for assignments, one entry per
 * settings name: the executor, its parameters and the requesting module's
 * display name for the owner. A requesting module defines its name; the AI
 * module keeps and validates the entry. The object is data: no code of
 * assignments depends on a name's value, and the names appear only here.
 * Fixed in code; how a requesting module's preferences choose an executor
 * belongs to epic oferty-pracy-334.
 *
 * The requesting modules still request AI work the old way, with the
 * settings they keep in `client-settings.ts`; each adds its entry here when
 * it moves to assignments (tasks oferty-pracy-sq2.8 to sq2.10). An entry
 * looks like
 *
 *   profile: {
 *     executor: 'openai',
 *     parameters: { model: 'gpt-6-luna', reasoningEffort: 'low' },
 *     requestingModule: 'Profil',
 *   }
 */
export const assignmentSettings: Readonly<Record<string, unknown>> = {}

import { randomUUID } from 'node:crypto'
import { transaction } from '../../lib/db.ts'
import {
  emptyProfile,
  profileSchema,
  type ProfileData,
} from '../../lib/profile/model.ts'
import { ProfileConflict } from './errors.ts'
import {
  activateVersion,
  countImports,
  findActiveVersionRecord,
  findDraft,
  findImportText,
  findVersionByCommand,
  insertVersion,
  listVersions,
  lockHead,
  upsertDraft,
  type DraftRecord,
  type VersionRecord,
} from './infrastructure/persistence/profile.ts'

/**
 * The owner's profile as the profile page shows it: the active version, the
 * editable draft with its revision and the list of confirmed versions. Before
 * the first save the draft is the active version's data, or an empty profile.
 */
// ASSUMPTION(oferty-pracy-0mq.11/ASM-3): the stored rows, so the profile
// route keeps its response.
export async function readProfile() {
  const [active, draft, versions] = await Promise.all([
    findActiveVersionRecord(),
    findDraft(),
    listVersions(),
  ])
  return { active, draft: draft ?? initialDraft(active), versions }
}

/**
 * Saves the draft when it still has the expected revision. Every fact that
 * comes from a CV must name an import of the profile and quote the text of
 * the revision it names. A changed draft is a conflict without a write.
 */
export async function saveDraft(value: unknown, expectedRevision: number) {
  const data = profileSchema.parse(value)
  return transaction(async () => {
    const activeId = await lockHead()
    const current = await findDraft()
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new ProfileConflict('Draft changed in another tab')
    return writeDraft(data, expectedRevision, activeId)
  })
}

/**
 * Confirms the draft as a new immutable version and activates it, in one
 * transaction. The command id makes a repeat return the same version; a
 * repeat with different input, a changed draft or a changed active version
 * is a conflict without a write.
 */
export async function confirmProfile(
  expectedRevision: number,
  expectedActiveVersionId: string | null,
  commandId: string,
) {
  return transaction(async () => {
    const activeId = await lockHead()
    const previous = await findVersionByCommand(commandId)
    if (previous) {
      if (
        previous.draft_revision !== expectedRevision ||
        previous.previous_version_id !== expectedActiveVersionId
      )
        throw new ProfileConflict('Command already used with different input')
      return previous
    }
    const draft = await findDraft()
    if (
      !draft ||
      draft.revision !== expectedRevision ||
      activeId !== expectedActiveVersionId ||
      draft.base_version_id !== expectedActiveVersionId
    )
      throw new ProfileConflict('Profile changed; reload before confirming')
    const version = await insertVersion({
      id: randomUUID(),
      data: profileSchema.parse(draft.data),
      commandId,
      draftRevision: expectedRevision,
      previousVersionId: expectedActiveVersionId,
    })
    await activateVersion(version.id)
    return version
  })
}

/**
 * The draft the owner edits now: the saved one, or the starting draft from
 * the active version. Call it with the profile head locked.
 */
export async function currentDraft(): Promise<DraftRecord> {
  return (await findDraft()) ?? initialDraft(await findActiveVersionRecord())
}

/**
 * Checks the provenance of the data and writes it as the draft's next
 * revision. Runs in the caller's transaction, with the profile head locked
 * and the expected revision already checked.
 */
export async function writeDraft(
  data: ProfileData,
  expectedRevision: number,
  activeId: string | null,
) {
  await checkProvenance(data)
  return upsertDraft(expectedRevision + 1, activeId, data)
}

function initialDraft(active: VersionRecord | null): DraftRecord {
  return {
    revision: 0,
    base_version_id: active?.id ?? null,
    data: active?.data ?? emptyProfile(),
  }
}

async function checkProvenance(data: ProfileData) {
  if ((await countImports(data.sources)) !== data.sources.length)
    throw new Error('Invalid import references')
  for (const fact of [...data.skills, ...data.experience]) {
    if (!fact.source) continue
    if (!data.sources.includes(fact.source.importId))
      throw new Error('Missing provenance import')
    const text = await findImportText(
      fact.source.importId,
      fact.source.textRevision,
    )
    if (!text || !text.includes(fact.source.evidence))
      throw new Error('Invalid provenance evidence')
  }
}

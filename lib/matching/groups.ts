import { randomUUID } from 'node:crypto'
import { batchArchive } from './archive.ts'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import { z } from 'zod'
import { db, queueDatabase, transaction } from '../db.ts'
import {
  chargeCeiling,
  reserve,
  type AiConfiguration,
} from '../../modules/ai/index.ts'
import { requireQueued } from '../queue.ts'
import {
  activeProfileVersion,
  adsForAssessment,
  currentAdVersions,
} from './ratings.ts'
import {
  BatchClient,
  BatchError,
  batchFailure,
  terminal,
  type batchRequest,
} from './batch.ts'
import {
  prepareMatching,
  fundAttempt,
  settle,
  applyMatchingLine,
  matchingConfiguration,
  MatchingError,
} from './store.ts'
export const matchingGroupQueue = 'offer-matching-group'
export const groupCommandSchema = z
  .object({
    commandId: z
      .string()
      .uuid()
      .transform((id) => id.toLowerCase()),
    offerIds: z
      .array(
        z
          .string()
          .uuid()
          .transform((id) => id.toLowerCase()),
      )
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate offers'),
  })
  .strict()
type Item = { id: string; offerId: string; state: string; reused: boolean }
async function groupView(id: string, reused: boolean) {
  const group = (
    await db().query('SELECT id,state,items FROM matching_groups WHERE id=$1', [
      id,
    ])
  ).rows[0]
  const items: Item[] = group.items
  const current = (
    await db().query(
      'SELECT id,state FROM matching_requests WHERE id=ANY($1::uuid[])',
      [items.map((item) => item.id)],
    )
  ).rows
  return {
    groupId: id,
    state: String(group.state),
    reused,
    items: items.map((item) => ({
      ...item,
      state: String(
        current.find((row) => row.id === item.id)?.state ?? item.state,
      ),
    })),
  }
}
/**
 * Funds a group waiting for budget, all members or none, and queues it.
 * Runs in the caller's transaction; a group another run has already
 * funded is left as it is.
 */
async function fundGroup(boss: PgBoss, id: string) {
  const waiting = (
    await db().query(
      "SELECT id FROM matching_groups WHERE id=$1 AND state='waiting_budget' FOR UPDATE",
      [id],
    )
  ).rowCount
  if (!waiting) return
  const members = (
    await db().query(
      "SELECT id,configuration FROM matching_requests WHERE group_id=$1 AND state='waiting_budget' ORDER BY id FOR UPDATE",
      [id],
    )
  ).rows
  if (!members.length) {
    await db().query(
      "UPDATE matching_groups SET state='completed',cleaned=true,updated_at=now() WHERE id=$1",
      [id],
    )
    return
  }
  // Each check covers the members before it, so the last one covers the
  // whole group; nothing is reserved unless every member fits.
  const now = new Date()
  let total = '0'
  let month = ''
  for (const member of members) {
    const budget = await reserve(db(), member.configuration, now, total)
    if (!budget.enough) return
    total = budget.cost
    month = budget.month
  }
  for (const member of members) {
    const config: AiConfiguration = member.configuration
    await fundAttempt(
      boss,
      member.id,
      config,
      {
        month,
        cost: chargeCeiling(
          config,
          config.maxInputTokens,
          config.maxOutputTokens,
        ),
      },
      false,
    )
  }
  await db().query(
    "UPDATE matching_groups SET state='queued',updated_at=now() WHERE id=$1",
    [id],
  )
  await requireQueued(
    boss.send(
      matchingGroupQueue,
      { groupId: id },
      {
        db: queueDatabase,
        retryLimit: 0,
        expireInSeconds: 300,
      },
    ),
  )
}
export async function enqueueMatchingGroup(boss: PgBoss, value: unknown) {
  const command = groupCommandSchema.parse(value)
  const ids = [...command.offerIds].sort()
  // One read of the active version for the whole group, before the
  // transaction: every offer gets the same version. The ads are read in bulk
  // the same way, without a lock.
  const profile = await activeProfileVersion()
  const ads = await adsForAssessment(ids)
  try {
    return await transaction(async () => {
      const client = db()
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `matching-command-${command.commandId}`,
      ])
      const existing = (
        await client.query(
          'SELECT id,ad_ids FROM matching_groups WHERE command_id=$1',
          [command.commandId],
        )
      ).rows[0]
      if (existing) {
        if (JSON.stringify(existing.ad_ids) !== JSON.stringify(ids))
          throw new MatchingError(
            'Ten identyfikator zlecenia dotyczy innych ofert. Odśwież zaznaczenie.',
          )
        return groupView(existing.id, true)
      }
      const config = matchingConfiguration()
      if (!config)
        throw new MatchingError(
          'Skonfiguruj model i cennik Batch przed oceną ofert.',
        )
      if (!profile)
        throw new MatchingError('Najpierw zatwierdź profil zawodowy.')
      const id = randomUUID()
      await client.query(
        "INSERT INTO matching_groups(id,command_id,ad_ids,state,configuration) VALUES($1,$2,$3,'waiting_budget',$4)",
        [id, command.commandId, ids, config],
      )
      const items: Item[] = []
      for (const offerId of ids) {
        const item = await prepareMatching(
          boss,
          offerId,
          config,
          profile,
          ads.get(offerId),
          false,
        )
        items.push({ ...item, offerId })
        if (!item.reused)
          await client.query(
            'UPDATE matching_requests SET group_id=$2 WHERE id=$1',
            [item.id, id],
          )
      }
      const lines = (
        await client.query(
          'SELECT id,request_payload FROM matching_requests WHERE group_id=$1 AND request_payload IS NOT NULL ORDER BY id',
          [id],
        )
      ).rows.map((row) =>
        JSON.stringify({
          custom_id: row.id,
          method: 'POST',
          url: '/v1/responses',
          body: row.request_payload,
        }),
      )
      if (
        Buffer.byteLength(lines.join('\n') + (lines.length ? '\n' : '')) >
        2 * 1024 * 1024
      )
        throw new MatchingError(
          'Zaznacz mniej ofert: plik tej partii przekracza 2 MiB.',
        )
      await client.query('UPDATE matching_groups SET items=$2 WHERE id=$1', [
        id,
        JSON.stringify(items),
      ])
      await fundGroup(boss, id)
      return groupView(id, false)
    })
  } catch (error) {
    if (error instanceof BatchError && error.code === 'limit')
      throw new MatchingError(
        'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.',
      )
    throw error
  }
}
/**
 * Ends a group that is still in the state `from` and its unfinished
 * members, settling their attempts. A group another run has moved on is
 * left as it is.
 */
async function failGroup(
  id: string,
  from: string,
  state: 'failed' | 'unknown',
  message: string,
  cost: string | null = null,
) {
  await transaction(async () => {
    const ended = await db().query(
      'UPDATE matching_groups SET state=$3,error=$4,updated_at=now() WHERE id=$1 AND state=$2',
      [id, from, state, message],
    )
    if (!ended.rowCount) return
    const members = (
      await db().query(
        "UPDATE matching_requests SET state=$2,error=$3,updated_at=now() WHERE group_id=$1 AND state IN ('queued','uploading','submitting','submitted') RETURNING attempt_id",
        [id, state, message],
      )
    ).rows
    for (const member of members)
      if (member.attempt_id) await settle(member.attempt_id, cost)
  })
}
/** Moves a group and its members from one state to the next; false when another run moved it. */
async function advanceGroup(id: string, from: string, to: string) {
  return transaction(async () => {
    const moved = await db().query(
      'UPDATE matching_groups SET state=$3,updated_at=now() WHERE id=$1 AND state=$2',
      [id, from, to],
    )
    if (!moved.rowCount) return false
    await db().query(
      'UPDATE matching_requests SET state=$3,updated_at=now() WHERE group_id=$1 AND state=$2',
      [id, from, to],
    )
    return true
  })
}
/**
 * Carries a group one step further, like executeMatching for a single
 * request: it holds no connection between steps, and each step changes the
 * group's state only from the state it read.
 */
export async function executeMatchingGroup(
  boss: PgBoss,
  id: string,
  provider?: BatchClient,
) {
  // Read before the run starts; the reads take no lock (see applyMatchingLine).
  const activeProfileVersionId = (await activeProfileVersion())?.id ?? null
  const adVersions = await currentAdVersions(
    (
      await db().query<{ ad_id: string }>(
        'SELECT ad_id FROM matching_requests WHERE group_id=$1',
        [id],
      )
    ).rows.map((request) => request.ad_id),
  )
  let group = (
    await db().query('SELECT * FROM matching_groups WHERE id=$1', [id])
  ).rows[0]
  if (!group) return
  if (group.state === 'waiting_budget') {
    await transaction(() => fundGroup(boss, id))
    return
  }
  // ASSUMPTION(oferty-pracy-0mq.18/ASM-2): a group left in sending was
  // interrupted, as for a single request (see executeMatching).
  if (group.state === 'uploading' || group.state === 'submitting') {
    await failGroup(
      id,
      group.state,
      group.state === 'submitting' ? 'unknown' : 'failed',
      'Przerwano wysyłanie partii. Nie ponowiono automatycznie.',
      group.state === 'uploading' ? '0' : null,
    )
    return
  }
  if (group.state === 'unknown' || group.cleaned) return
  const api =
    provider ??
    new BatchClient(
      process.env.OPENAI_API_KEY ?? '',
      fetch,
      batchArchive(db(), id),
    )
  if (group.state === 'queued') {
    const rows = (
      await db().query(
        "SELECT id,request_payload FROM matching_requests WHERE group_id=$1 AND state='queued' ORDER BY id",
        [id],
      )
    ).rows
    if (!rows.length || rows.some((row) => !row.request_payload)) {
      await failGroup(
        id,
        'queued',
        'failed',
        'Brak zapisanych żądań partii. Nie zlecono analizy.',
        '0',
      )
      return
    }
    const taken = await transaction(async () => {
      if (!(await advanceGroup(id, 'queued', 'uploading'))) return false
      await db().query(
        "UPDATE ai_attempts SET state='running' WHERE id IN (SELECT attempt_id FROM matching_requests WHERE group_id=$1)",
        [id],
      )
      return true
    })
    if (!taken) return
    let file: string
    try {
      file = await api.upload(
        rows.map((row) => ({
          custom_id: row.id,
          method: 'POST',
          url: '/v1/responses',
          body: row.request_payload,
        })) as ReturnType<typeof batchRequest>[],
      )
    } catch (e) {
      await failGroup(
        id,
        'uploading',
        'failed',
        batchFailure(
          'Nie udało się przesłać pliku partii. Nie zlecono analiz.',
          e,
        ),
        '0',
      )
      return
    }
    const sending = await transaction(async () => {
      if (!(await advanceGroup(id, 'uploading', 'submitting'))) return false
      await db().query(
        'UPDATE matching_groups SET input_file_id=$2 WHERE id=$1',
        [id, file],
      )
      return true
    })
    if (!sending) return
    try {
      const batch = await api.create(file, id)
      if (batch.input_file_id !== file) throw new BatchError('format')
      const submitted = await transaction(async () => {
        if (!(await advanceGroup(id, 'submitting', 'submitted'))) return false
        await db().query(
          'UPDATE matching_groups SET batch_id=$2,status=$3 WHERE id=$1',
          [id, batch.id, batch.status],
        )
        return true
      })
      if (!submitted) return
    } catch (e) {
      const rejected =
        e instanceof BatchError &&
        e.code === 'http' &&
        e.status !== null &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408
      await failGroup(
        id,
        'submitting',
        rejected ? 'failed' : 'unknown',
        batchFailure(
          'Nie potwierdzono utworzenia partii. Nie ponowiono automatycznie.',
          e,
        ),
        rejected ? '0' : null,
      )
      return
    }
    group = (
      await db().query('SELECT * FROM matching_groups WHERE id=$1', [id])
    ).rows[0]
  }
  if (group.state === 'submitted') {
    let batch
    try {
      batch = await api.retrieve(group.batch_id)
      if (batch.input_file_id !== group.input_file_id)
        throw new BatchError('format')
    } catch (e) {
      await db().query('UPDATE matching_groups SET error=$2 WHERE id=$1', [
        id,
        batchFailure(
          'Nie udało się sprawdzić partii. Odczyt zostanie wznowiony.',
          e,
        ),
      ])
      return
    }
    await db().query(
      'UPDATE matching_groups SET status=$2,output_file_id=$3,error_file_id=$4,updated_at=now() WHERE id=$1',
      [
        id,
        batch.status,
        batch.output_file_id ?? null,
        batch.error_file_id ?? null,
      ],
    )
    if (!terminal(batch)) return
    const members = (
      await db().query(
        'SELECT * FROM matching_requests WHERE group_id=$1 AND request_payload IS NOT NULL ORDER BY id',
        [id],
      )
    ).rows
    let results
    try {
      results = await api.results(
        batch,
        members.map((row) => row.id),
      )
    } catch (e) {
      if (
        e instanceof BatchError &&
        (e.code === 'format' || e.code === 'limit' || e.status === 404)
      )
        await failGroup(
          id,
          'submitted',
          'failed',
          batchFailure(
            'Nieprawidłowy lub utracony plik wyników. Koszt wymaga sprawdzenia.',
            e,
          ),
        )
      else
        await db().query('UPDATE matching_groups SET error=$2 WHERE id=$1', [
          id,
          batchFailure(
            'Odbiór wyników nie powiódł się; odczyt zostanie wznowiony.',
            e,
          ),
        ])
      return
    }
    for (const member of members)
      if (member.state === 'submitted')
        await applyMatchingLine(
          member,
          results.get(member.id),
          batch,
          activeProfileVersionId,
          adVersions.get(member.ad_id),
        )
    await db().query(
      "UPDATE matching_groups SET state='completed',error=NULL,updated_at=now() WHERE id=$1 AND state='submitted'",
      [id],
    )
  }
  group = (await db().query('SELECT * FROM matching_groups WHERE id=$1', [id]))
    .rows[0]
  if (['completed', 'failed'].includes(group.state) && !group.cleaned) {
    try {
      for (const file of new Set(
        [group.input_file_id, group.output_file_id, group.error_file_id].filter(
          (v): v is string => typeof v === 'string',
        ),
      ))
        await api.remove(file)
      await db().query('UPDATE matching_groups SET cleaned=true WHERE id=$1', [
        id,
      ])
    } catch {
      /* Recovery retries cleanup, never the paid submission. */
    }
  }
}
export async function recoverMatchingGroups(pool: Pool, boss: PgBoss) {
  const rows = (
    await pool.query(
      "SELECT id FROM matching_groups WHERE state IN ('waiting_budget','queued','uploading','submitting','submitted') OR (state IN ('completed','failed') AND NOT cleaned)",
    )
  ).rows
  for (const row of rows)
    await boss.send(
      matchingGroupQueue,
      { groupId: row.id },
      {
        singletonKey: row.id,
        singletonSeconds: 60,
        retryLimit: 0,
        expireInSeconds: 300,
      },
    )
}

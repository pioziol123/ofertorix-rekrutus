import { randomUUID } from 'node:crypto'
import { batchArchive } from './archive.ts'
import type { Pool, PoolClient } from 'pg'
import type { PgBoss } from 'pg-boss'
import { z } from 'zod'
import { tx } from '../profile/store.ts'
import { requireQueued } from '../queue.ts'
import { activeProfileVersion } from './ratings.ts'
import {
  BatchClient,
  BatchError,
  batchFailure,
  terminal,
  type batchRequest,
} from './batch.ts'
import {
  prepareMatching,
  attempt,
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
async function groupView(client: PoolClient, id: string, reused: boolean) {
  const group = (
    await client.query(
      'SELECT id,state,items FROM matching_groups WHERE id=$1',
      [id],
    )
  ).rows[0]
  const items: Item[] = group.items
  const current = (
    await client.query(
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
async function fundGroup(client: PoolClient, boss: PgBoss, id: string) {
  const members = (
    await client.query(
      "SELECT id,configuration FROM matching_requests WHERE group_id=$1 AND state='waiting_budget' ORDER BY id",
      [id],
    )
  ).rows
  if (!members.length) {
    await client.query(
      "UPDATE matching_groups SET state='completed',cleaned=true,updated_at=now() WHERE id=$1",
      [id],
    )
    return
  }
  await client.query('SAVEPOINT matching_group_budget')
  for (const member of members) {
    if (
      !(await attempt(client, boss, member.id, member.configuration, false))
    ) {
      await client.query('ROLLBACK TO SAVEPOINT matching_group_budget')
      await client.query('RELEASE SAVEPOINT matching_group_budget')
      return
    }
  }
  await client.query('RELEASE SAVEPOINT matching_group_budget')
  await client.query(
    "UPDATE matching_groups SET state='queued',updated_at=now() WHERE id=$1",
    [id],
  )
  await requireQueued(
    boss.send(
      matchingGroupQueue,
      { groupId: id },
      {
        db: { executeSql: (sql, values) => client.query(sql, values) },
        retryLimit: 0,
        expireInSeconds: 300,
      },
    ),
  )
}
export async function enqueueMatchingGroup(
  pool: Pool,
  boss: PgBoss,
  value: unknown,
) {
  const command = groupCommandSchema.parse(value)
  const ids = [...command.offerIds].sort()
  // One read of the active version for the whole group, before the
  // transaction holds a connection: every offer gets the same version.
  const profile = await activeProfileVersion()
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
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
        return groupView(client, existing.id, true)
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
          client,
          boss,
          offerId,
          config,
          profile,
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
      await fundGroup(client, boss, id)
      return groupView(client, id, false)
    })
  } catch (error) {
    if (error instanceof BatchError && error.code === 'limit')
      throw new MatchingError(
        'Jedna z ofert przekracza limit danych oceny. Zmień zaznaczenie lub limit wejścia.',
      )
    throw error
  } finally {
    client.release()
  }
}
async function failGroup(
  client: PoolClient,
  id: string,
  state: 'failed' | 'unknown',
  message: string,
  cost: string | null = null,
) {
  await tx(client, async () => {
    const members = (
      await client.query(
        "UPDATE matching_requests SET state=$2,error=$3,updated_at=now() WHERE group_id=$1 AND state IN ('queued','uploading','submitting','submitted') RETURNING attempt_id",
        [id, state, message],
      )
    ).rows
    for (const member of members)
      if (member.attempt_id) await settle(client, member.attempt_id, cost)
    await client.query(
      'UPDATE matching_groups SET state=$2,error=$3,updated_at=now() WHERE id=$1',
      [id, state, message],
    )
  })
}
export async function executeMatchingGroup(
  pool: Pool,
  boss: PgBoss,
  id: string,
  provider?: BatchClient,
) {
  // Read before this run holds its connection, so publishing results never
  // waits for a second one; the read takes no lock (see applyMatchingLine).
  const activeProfileVersionId = (await activeProfileVersion())?.id ?? null
  const client = await pool.connect()
  try {
    if (
      !(
        await client.query(
          'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
          [`matching-group-${id}`],
        )
      ).rows[0].locked
    )
      return
    try {
      let group = (
        await client.query('SELECT * FROM matching_groups WHERE id=$1', [id])
      ).rows[0]
      if (!group) return
      if (group.state === 'waiting_budget') {
        await tx(client, () => fundGroup(client, boss, id))
        return
      }
      if (group.state === 'uploading' || group.state === 'submitting') {
        await failGroup(
          client,
          id,
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
          batchArchive(pool, id),
        )
      if (group.state === 'queued') {
        const rows = (
          await client.query(
            "SELECT id,request_payload FROM matching_requests WHERE group_id=$1 AND state='queued' ORDER BY id",
            [id],
          )
        ).rows
        if (!rows.length || rows.some((row) => !row.request_payload)) {
          await failGroup(
            client,
            id,
            'failed',
            'Brak zapisanych żądań partii. Nie zlecono analizy.',
            '0',
          )
          return
        }
        await tx(client, async () => {
          await client.query(
            "UPDATE matching_groups SET state='uploading',updated_at=now() WHERE id=$1",
            [id],
          )
          await client.query(
            "UPDATE matching_requests SET state='uploading',updated_at=now() WHERE group_id=$1 AND state='queued'",
            [id],
          )
          await client.query(
            "UPDATE ai_attempts SET state='running' WHERE id IN (SELECT attempt_id FROM matching_requests WHERE group_id=$1)",
            [id],
          )
        })
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
            client,
            id,
            'failed',
            batchFailure(
              'Nie udało się przesłać pliku partii. Nie zlecono analiz.',
              e,
            ),
            '0',
          )
          return
        }
        await tx(client, async () => {
          await client.query(
            "UPDATE matching_groups SET state='submitting',input_file_id=$2,updated_at=now() WHERE id=$1",
            [id, file],
          )
          await client.query(
            "UPDATE matching_requests SET state='submitting',updated_at=now() WHERE group_id=$1 AND state='uploading'",
            [id],
          )
        })
        try {
          const batch = await api.create(file, id)
          if (batch.input_file_id !== file) throw new BatchError('format')
          await tx(client, async () => {
            await client.query(
              "UPDATE matching_groups SET state='submitted',batch_id=$2,status=$3,updated_at=now() WHERE id=$1",
              [id, batch.id, batch.status],
            )
            await client.query(
              "UPDATE matching_requests SET state='submitted',updated_at=now() WHERE group_id=$1 AND state='submitting'",
              [id],
            )
          })
        } catch (e) {
          const rejected =
            e instanceof BatchError &&
            e.code === 'http' &&
            e.status !== null &&
            e.status >= 400 &&
            e.status < 500 &&
            e.status !== 408
          await failGroup(
            client,
            id,
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
          await client.query('SELECT * FROM matching_groups WHERE id=$1', [id])
        ).rows[0]
      }
      if (group.state === 'submitted') {
        let batch
        try {
          batch = await api.retrieve(group.batch_id)
          if (batch.input_file_id !== group.input_file_id)
            throw new BatchError('format')
        } catch (e) {
          await client.query(
            'UPDATE matching_groups SET error=$2 WHERE id=$1',
            [
              id,
              batchFailure(
                'Nie udało się sprawdzić partii. Odczyt zostanie wznowiony.',
                e,
              ),
            ],
          )
          return
        }
        await client.query(
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
          await client.query(
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
              client,
              id,
              'failed',
              batchFailure(
                'Nieprawidłowy lub utracony plik wyników. Koszt wymaga sprawdzenia.',
                e,
              ),
            )
          else
            await client.query(
              'UPDATE matching_groups SET error=$2 WHERE id=$1',
              [
                id,
                batchFailure(
                  'Odbiór wyników nie powiódł się; odczyt zostanie wznowiony.',
                  e,
                ),
              ],
            )
          return
        }
        for (const member of members)
          if (member.state === 'submitted')
            await applyMatchingLine(
              client,
              member,
              results.get(member.id),
              batch,
              activeProfileVersionId,
            )
        await client.query(
          "UPDATE matching_groups SET state='completed',error=NULL,updated_at=now() WHERE id=$1",
          [id],
        )
      }
      group = (
        await client.query('SELECT * FROM matching_groups WHERE id=$1', [id])
      ).rows[0]
      if (['completed', 'failed'].includes(group.state) && !group.cleaned) {
        try {
          for (const file of new Set(
            [
              group.input_file_id,
              group.output_file_id,
              group.error_file_id,
            ].filter((v): v is string => typeof v === 'string'),
          ))
            await api.remove(file)
          await client.query(
            'UPDATE matching_groups SET cleaned=true WHERE id=$1',
            [id],
          )
        } catch {
          /* Recovery retries cleanup, never the paid submission. */
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        `matching-group-${id}`,
      ])
    }
  } finally {
    client.release()
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

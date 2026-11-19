import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transaction } from '../../lib/db.ts'
import { readCurrentAdVersions } from '../sources/index.ts'
import { companyLinkCommand, createCompanyCommand } from './domain/company.ts'
import { CompanyConflict, CompanyNotFound } from './errors.ts'
import {
  companyExists,
  deleteLink,
  findCompanyCommand,
  insertCompany,
  insertLink,
  insertLinkHistory,
  linkedCompany,
  lockAdLinks,
  lockCompanyCommand,
  saveCompanyCommand,
} from './infrastructure/persistence/companies.ts'

const uuid = z.uuid()

/**
 * Runs an owner's command once: a repeat with the same content gets the
 * first answer, a repeat with other content a conflict.
 */
async function command(
  id: string,
  input: unknown,
  run: () => Promise<{ id: string }>,
) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
  return transaction(async () => {
    await lockCompanyCommand(id)
    const existing = await findCompanyCommand(id)
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new CompanyConflict()
      return existing.result
    }
    const result = await run()
    await saveCompanyCommand(id, fingerprint, result)
    return result
  })
}

export async function createCompany(value: unknown) {
  const input = createCompanyCommand.parse(value)
  return command(
    input.commandId,
    { operation: 'create', ...input },
    async () => {
      const id = randomUUID()
      await insertCompany({
        id,
        name: input.name,
        kind: input.kind,
        website: input.website,
        description: input.description,
      })
      return { id }
    },
  )
}

export async function changeCompanyLink(companyId: string, value: unknown) {
  if (!uuid.safeParse(companyId).success) throw new CompanyNotFound()
  companyId = companyId.toLowerCase()
  const input = companyLinkCommand.parse(value)
  // The version linked is the one read here, before the command holds its
  // connection and without a row lock: an ad that changes before the write
  // keeps the link on the version read (A6-R05, accepted as for matching).
  const [adVersion] = await readCurrentAdVersions([input.adId])
  return command(
    input.commandId,
    { operation: 'link', companyId, ...input },
    async () => {
      await lockAdLinks(input.adId)
      if (!(await companyExists(companyId))) throw new CompanyNotFound()
      if (!adVersion) throw new CompanyNotFound()
      const current = await linkedCompany(input.adId, input.role)
      if (
        current !== input.expectedCompanyId ||
        (input.action === 'unlink' && current !== companyId)
      )
        throw new CompanyConflict()
      const change = {
        adId: input.adId,
        role: input.role,
        companyId,
        evidence: input.evidence,
        revisionId: adVersion.versionId,
      }
      if (input.action === 'link') {
        if (current !== null) throw new CompanyConflict()
        await insertLink(change)
      } else await deleteLink(input.adId, input.role)
      await insertLinkHistory(randomUUID(), input.action, change)
      return { id: companyId }
    },
  )
}

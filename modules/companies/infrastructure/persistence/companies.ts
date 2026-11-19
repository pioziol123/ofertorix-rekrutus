import { db } from '../../../../lib/db.ts'
import type { CompanyRole } from '../../domain/company.ts'

/** A stored command of the owner, with the answer it got. */
export type StoredCommand = { fingerprint: string; result: { id: string } }

/** Holds the command id for the transaction, so a repeat waits for it. */
export async function lockCompanyCommand(commandId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `company-command-${commandId}`,
  ])
}

export async function findCompanyCommand(
  commandId: string,
): Promise<StoredCommand | null> {
  return (
    (
      await db().query<StoredCommand>(
        'SELECT * FROM company_commands WHERE id=$1',
        [commandId],
      )
    ).rows[0] ?? null
  )
}

export async function saveCompanyCommand(
  commandId: string,
  fingerprint: string,
  result: { id: string },
) {
  await db().query(
    'INSERT INTO company_commands(id,fingerprint,result) VALUES($1,$2,$3)',
    [commandId, fingerprint, result],
  )
}

export async function insertCompany(company: {
  id: string
  name: string
  kind: string
  website: string | null
  description: string
}) {
  await db().query(
    'INSERT INTO companies(id,name,kind,website,description) VALUES($1,$2,$3,$4,$5)',
    [
      company.id,
      company.name,
      company.kind,
      company.website,
      company.description,
    ],
  )
}

/** Holds the links of an ad for the transaction. */
export async function lockAdLinks(adId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `company-ad-${adId}`,
  ])
}

export async function companyExists(companyId: string): Promise<boolean> {
  return !!(
    await db().query('SELECT id FROM companies WHERE id=$1', [companyId])
  ).rowCount
}

/** The company linked to an ad in a role, or null. */
export async function linkedCompany(
  adId: string,
  role: CompanyRole,
): Promise<string | null> {
  return (
    (
      await db().query(
        'SELECT company_id FROM company_ad_links WHERE ad_id=$1 AND role=$2',
        [adId, role],
      )
    ).rows[0]?.company_id ?? null
  )
}

/** A change of a link, as the history records it. */
export type LinkChange = {
  adId: string
  role: CompanyRole
  companyId: string
  evidence: string
  revisionId: string
}

export async function insertLink(link: LinkChange) {
  await db().query(
    'INSERT INTO company_ad_links(ad_id,role,company_id,evidence,revision_id) VALUES($1,$2,$3,$4,$5)',
    [link.adId, link.role, link.companyId, link.evidence, link.revisionId],
  )
}

export async function deleteLink(adId: string, role: CompanyRole) {
  await db().query('DELETE FROM company_ad_links WHERE ad_id=$1 AND role=$2', [
    adId,
    role,
  ])
}

export async function insertLinkHistory(
  id: string,
  action: 'link' | 'unlink',
  change: LinkChange,
) {
  await db().query(
    'INSERT INTO company_link_history(id,ad_id,role,company_id,action,evidence,revision_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      change.adId,
      change.role,
      change.companyId,
      action,
      change.evidence,
      change.revisionId,
    ],
  )
}

/** Every company with the number of ads linked to it. */
export async function companiesWithOfferCounts(): Promise<
  Record<string, unknown>[]
> {
  return (
    await db().query(
      `SELECT c.*,count(DISTINCT l.ad_id)::int AS offer_count FROM companies c LEFT JOIN company_ad_links l ON l.company_id=c.id GROUP BY c.id`,
    )
  ).rows
}

export async function readCompanyRow(
  companyId: string,
): Promise<Record<string, unknown> | null> {
  return (
    (await db().query('SELECT * FROM companies WHERE id=$1', [companyId]))
      .rows[0] ?? null
  )
}

/** The ads linked to a company, with the role of each link. */
export async function companyLinks(companyId: string) {
  return (
    await db().query<{ ad_id: string; role: CompanyRole }>(
      'SELECT ad_id,role FROM company_ad_links WHERE company_id=$1 ORDER BY role',
      [companyId],
    )
  ).rows
}

/** The link history of a company, newest first. */
export async function companyLinkHistory(
  companyId: string,
): Promise<Record<string, unknown>[]> {
  return (
    await db().query(
      'SELECT * FROM company_link_history WHERE company_id=$1 ORDER BY created_at DESC,id DESC',
      [companyId],
    )
  ).rows
}

/** The companies linked to an ad, with the role and evidence of each link. */
export async function adCompanyLinks(
  adId: string,
): Promise<Record<string, unknown>[]> {
  return (
    await db().query(
      `SELECT l.role,l.evidence,c.id,c.name,c.kind FROM company_ad_links l JOIN companies c ON c.id=l.company_id WHERE l.ad_id=$1`,
      [adId],
    )
  ).rows
}

/** At most 20 companies with the given name, any case, oldest first. */
export async function companiesNamed(
  name: string,
): Promise<Record<string, unknown>[]> {
  return (
    await db().query(
      `SELECT id,name,kind FROM companies WHERE lower(name)=lower($1) ORDER BY created_at,id LIMIT 20`,
      [name],
    )
  ).rows
}

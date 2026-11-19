import { profileSchema, type ProfileData } from './domain/profile-data.ts'
import {
  findActiveVersion,
  findVersionMetadata,
  findVersionRecord,
  findVersions,
  type VersionRow,
} from './infrastructure/persistence/profile-versions.ts'
import type { VersionRecord } from './infrastructure/persistence/profile.ts'

/** Identity of a confirmed profile version. */
export type ProfileVersionMetadata = {
  id: string
  /** Sequential number shown to the owner, starting at 1. */
  number: number
  confirmedAt: Date
}

/** A confirmed, immutable profile version with its data. */
export type ProfileVersion = ProfileVersionMetadata & { data: ProfileData }

/** The active confirmed version, or an explicit "no active version". */
export type ActiveProfileVersion =
  { active: true; version: ProfileVersion } | { active: false }

/**
 * Reads the active confirmed profile version with its id. The read takes no
 * row locks, so it never delays a confirmation; a caller that needs the
 * version to stay active decides itself how to treat a later change.
 */
export async function readActiveProfileVersion(): Promise<ActiveProfileVersion> {
  const row = await findActiveVersion()
  return row ? { active: true, version: toVersion(row) } : { active: false }
}

/**
 * Reads the confirmed versions with the given ids in one query. Unknown ids
 * are left out of the result; the order of the result is not defined.
 */
export async function readProfileVersions(
  ids: readonly string[],
): Promise<ProfileVersion[]> {
  if (!ids.length) return []
  return (await findVersions(unique(ids))).map(toVersion)
}

/**
 * Reads id, number and confirmation time of the given versions in one
 * query, for views that list many assessments. Unknown ids are left out.
 */
export async function readProfileVersionMetadata(
  ids: readonly string[],
): Promise<ProfileVersionMetadata[]> {
  if (!ids.length) return []
  return (await findVersionMetadata(unique(ids))).map(toMetadata)
}

function toMetadata(row: Omit<VersionRow, 'data'>): ProfileVersionMetadata {
  return { id: row.id, number: row.number, confirmedAt: row.created_at }
}

function toVersion(row: VersionRow): ProfileVersion {
  return { ...toMetadata(row), data: profileSchema.parse(row.data) }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/**
 * One confirmed version as it was saved, for the profile history: its data,
 * number, confirmation time, the command and draft revision that created it
 * and the version it replaced. Null for an unknown id.
 */
// ASSUMPTION(oferty-pracy-0mq.11/ASM-3): the stored row, so the version route
// keeps its response; the reads above are shaped for Matching.
export async function readVersionRecord(
  id: string,
): Promise<VersionRecord | null> {
  return findVersionRecord(id)
}

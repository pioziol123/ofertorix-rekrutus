/**
 * Public operations of the Profile module (the owner's professional
 * profile). Other modules and entry points use only these.
 */
export {
  readActiveProfileVersion,
  readProfileVersionMetadata,
  readProfileVersions,
  type ActiveProfileVersion,
  type ProfileVersion,
  type ProfileVersionMetadata,
} from './read-confirmed-versions.ts'
export type { ProfileData } from '../../lib/profile/model.ts'

import { jobspyCatalogStatus } from '../../../lib/sources/jobspy-sync'
import { database } from '../../utils/database'
export default defineEventHandler(() => jobspyCatalogStatus(database))

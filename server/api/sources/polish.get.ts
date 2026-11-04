import { polishCatalogStatus } from '../../../lib/sources/polish-sync'
import { database } from '../../utils/database'
export default defineEventHandler(() => polishCatalogStatus(database))

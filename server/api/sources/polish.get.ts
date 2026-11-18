import { readSourceCatalog } from '../../../modules/sources'
export default defineEventHandler(
  async () => (await readSourceCatalog()).polish,
)

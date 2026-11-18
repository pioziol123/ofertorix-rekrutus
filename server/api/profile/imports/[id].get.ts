import { uuid } from '../../../../lib/profile/model'
import { readImport } from '../../../../modules/profile/index'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) => {
  const imported = await readImport(uuid.parse(getRouterParam(event, 'id')))
  if (!imported)
    throw createError({ statusCode: 404, statusMessage: 'Import not found' })
  return imported
})

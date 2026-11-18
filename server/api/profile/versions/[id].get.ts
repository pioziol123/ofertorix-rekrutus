import { uuid } from '../../../../lib/profile/model'
import { readVersionRecord } from '../../../../modules/profile/index'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) => {
  const version = await readVersionRecord(
    uuid.parse(getRouterParam(event, 'id')),
  )
  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  return version
})

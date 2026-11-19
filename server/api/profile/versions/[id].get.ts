import { readVersionRecord } from '../../../../modules/profile/index'
import { uuid } from '../../../utils/http'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) => {
  const version = await readVersionRecord(
    uuid.parse(getRouterParam(event, 'id')),
  )
  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  return version
})

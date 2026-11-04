import { uuid } from '../../../../lib/profile/model'
import { database } from '../../../utils/database'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) => {
  const row = (
    await database.query('SELECT * FROM profile_versions WHERE id=$1', [
      uuid.parse(getRouterParam(event, 'id')),
    ])
  ).rows[0]
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  return row
})

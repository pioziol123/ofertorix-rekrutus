import { uuid } from '../../../../lib/profile/model'
import { scrubContacts } from '../../../../lib/profile/imports'
import { database } from '../../../utils/database'
import { profileHandler } from '../../../utils/profile'
export default profileHandler(async (event) => {
  const id = uuid.parse(getRouterParam(event, 'id'))
  const row = (
    await database.query('SELECT * FROM profile_imports WHERE id=$1', [id])
  ).rows[0]
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Import not found' })
  const { path_key: _path, sha256: _hash, ...view } = row
  return {
    ...view,
    suggested_text: scrubContacts(
      row.professional_text ?? row.source_text ?? '',
    ),
  }
})

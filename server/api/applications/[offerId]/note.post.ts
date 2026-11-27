import { saveNoteOverHttp } from '../../../../modules/recruitments/index'
import { recruitmentBody, recruitmentRoute } from '../../../utils/recruitments'

/** Saves the note of an offer's application (lq3 T2, A-R09–A-R12). */
export default recruitmentRoute(async (event) =>
  saveNoteOverHttp(
    getRouterParam(event, 'offerId'),
    await recruitmentBody(event),
  ),
)

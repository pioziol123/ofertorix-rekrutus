import { defineJob } from '../../../../lib/queues/index.ts'

/** The data of a request to read the text of an uploaded CV document. */
export type CvTextReading = { importId: string }

/**
 * The job of reading the text of an uploaded CV document. At most one CV is
 * read at a time in the whole system (B4-R04), so the key is a constant in
 * exclusivity mode. Its queue is created by its queue migration with the
 * same key mode; its attempts and time limit are in the queue configuration.
 */
export const cvTextReadingJob = defineJob<CvTextReading>({
  queue: 'profile-cv-text',
  key: { mode: 'exclusivity', value: 'profile-cv-text' },
})

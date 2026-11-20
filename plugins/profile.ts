/**
 * The Profile module plugin: registers reading the text of an uploaded CV
 * with its job handler and its failure handler, which asks for pasted text
 * after the last attempt failed (B4-R05).
 */
import type { HandlerRegistry } from '../lib/workers/index.ts'
import {
  cvTextReadingJob,
  endFailedCvTextReading,
  readCvText,
} from '../modules/profile/index.ts'

export function registerProfileJobs(registry: HandlerRegistry): void {
  registry.register(cvTextReadingJob, readCvText, endFailedCvTextReading)
}

import { ResearchConfigurationError } from '../../modules/companies/index'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { CompanyConflict, CompanyNotFound } from '../../lib/companies/store'
import { apiHandler } from './http'
export function companyHandler<T>(run: (event: H3Event) => Promise<T>) {
  return apiHandler(async (event) => {
    try {
      return await run(event)
    } catch (error) {
      if (error instanceof ResearchConfigurationError)
        throw createError({
          statusCode: 422,
          statusMessage: 'Configure company research model and pricing first',
        })
      if (error instanceof CompanyConflict)
        throw createError({
          statusCode: 409,
          statusMessage:
            'Company link changed or command was reused; reload to compare',
        })
      if (error instanceof CompanyNotFound)
        throw createError({
          statusCode: 404,
          statusMessage: 'Company or offer not found',
        })
      throw error
    }
  })
}

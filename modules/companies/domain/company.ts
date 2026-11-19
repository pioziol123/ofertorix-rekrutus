import { z } from 'zod'
export const companyRoles = ['publisher', 'employer', 'client'] as const
export type CompanyRole = (typeof companyRoles)[number]
export const companyRoleLabels = {
  publisher: 'Firma publikująca',
  employer: 'Firma zatrudniająca',
  client: 'Klient',
}
export const companyKindLabels = {
  organization: 'Organizacja',
  brand: 'Marka',
  unknown: 'Tożsamość nieustalona',
}
const uuid = z.uuid().transform((value) => value.toLowerCase())
export const createCompanyCommand = z
  .object({
    commandId: uuid,
    name: z.string().trim().min(1).max(300),
    kind: z.enum(['organization', 'brand', 'unknown']),
    website: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .refine((value) => {
        if (value === null) return true
        try {
          const url = new URL(value)
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password
          )
        } catch {
          return false
        }
      }, 'Podaj adres http lub https bez danych logowania'),
    description: z.string().trim().max(5000),
  })
  .strict()
export const companyLinkCommand = z
  .object({
    commandId: uuid,
    adId: uuid,
    role: z.enum(companyRoles),
    expectedCompanyId: uuid.nullable(),
    action: z.enum(['link', 'unlink']),
    evidence: z.string().trim().min(1).max(2000),
  })
  .strict()

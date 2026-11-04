import { z } from 'zod'
const percent = z.number().int().min(0).max(100)
export const weightsSchema = z
  .object({
    technologies: percent,
    experience: percent,
    conditions: percent,
    direction: percent,
  })
  .strict()
  .refine(
    (value) => Object.values(value).reduce((a, b) => a + b, 0) === 100,
    'Wagi muszą sumować się do 100%',
  )
export type Weights = z.infer<typeof weightsSchema>
export const defaultWeights: Weights = {
  technologies: 40,
  experience: 25,
  conditions: 20,
  direction: 15,
}

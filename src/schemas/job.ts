import { z } from 'zod'

export const JobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  parent_id: z.string().nullable().optional(),
  skill_points: z.number().int().min(0),
  icon: z.string().nullable().optional(),
  expanded: z.boolean().default(false),
})

export const JobCreateSchema = JobSchema
export const JobUpdateSchema = JobSchema.partial().omit({ id: true })

export type Job = z.infer<typeof JobSchema>
export type JobCreate = z.infer<typeof JobCreateSchema>
export type JobUpdate = z.infer<typeof JobUpdateSchema>

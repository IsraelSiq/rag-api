import { z } from 'zod'

const RequirementSchema = z.object({
  skillId: z.string(),
  level: z.number().int().min(1),
})

export const SkillSchema = z.object({
  id: z.string().min(1),
  job_id: z.string().min(1),
  name: z.string().min(1),
  max_level: z.number().int().min(1).max(20),
  type: z.enum(['active', 'passive', 'toggle']),
  element: z.string().nullable().optional(),
  description: z.string().default(''),
  requires: z.array(RequirementSchema).default([]),
})

export const SkillCreateSchema = SkillSchema
export const SkillUpdateSchema = SkillSchema.partial().omit({ id: true })

export type Skill = z.infer<typeof SkillSchema>
export type SkillCreate = z.infer<typeof SkillCreateSchema>
export type SkillUpdate = z.infer<typeof SkillUpdateSchema>

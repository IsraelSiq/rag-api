import { z } from 'zod'

const RequirementSchema = z.object({
  skillId: z.string(),
  level: z.number().int().min(1),
})

export const JobCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.number().int().min(1).max(5),
  parent_id: z.string().nullable().optional(),
  skill_points: z.number().int().min(0),
  icon: z.string().nullable().optional(),
  expanded: z.boolean().default(false),
})

export const JobUpdateSchema = JobCreateSchema.partial().omit({ id: true })

export const SkillCreateSchema = z.object({
  id: z.string().min(1),
  job_id: z.string().min(1),
  name: z.string().min(1),
  max_level: z.number().int().min(1).max(20),
  type: z.enum(['active', 'passive', 'toggle']),
  element: z.string().nullable().optional(),
  description: z.string().default(''),
  requires: z.array(RequirementSchema).default([]),
})

export const SkillUpdateSchema = SkillCreateSchema.partial().omit({ id: true })

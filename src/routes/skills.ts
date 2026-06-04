import type { FastifyInstance } from 'fastify'
import { supabase } from '../db/supabase'
import { SkillCreateSchema, SkillUpdateSchema } from '../schemas/skill'

export async function skillRoutes(app: FastifyInstance) {
  // GET /skills
  app.get(
    '/skills',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Listar skills (filtrar por job_id opcional)',
        querystring: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            type: { type: 'string', enum: ['active', 'passive', 'toggle'] },
          },
        },
      },
    },
    async (req, reply) => {
      const { job_id, type } = req.query as { job_id?: string; type?: string }
      let query = supabase.from('skills').select('*').order('name')
      if (job_id) query = query.eq('job_id', job_id)
      if (type) query = query.eq('type', type)
      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })
      return data
    },
  )

  // GET /skills/:id
  app.get(
    '/skills/:id',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Buscar skill por ID',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { data, error } = await supabase.from('skills').select('*').eq('id', id).single()
      if (error) return reply.status(404).send({ error: 'Skill not found' })
      return data
    },
  )

  // POST /skills
  app.post(
    '/skills',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Criar nova skill',
        body: {
          type: 'object',
          required: ['id', 'job_id', 'name', 'max_level', 'type'],
          properties: {
            id: { type: 'string' },
            job_id: { type: 'string' },
            name: { type: 'string' },
            max_level: { type: 'integer', minimum: 1, maximum: 20 },
            type: { type: 'string', enum: ['active', 'passive', 'toggle'] },
            element: { type: 'string', nullable: true },
            description: { type: 'string' },
            requires: {
              type: 'array',
              items: {
                type: 'object',
                required: ['skillId', 'level'],
                properties: {
                  skillId: { type: 'string' },
                  level: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = SkillCreateSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('skills').insert(parsed.data).select().single()
      if (error) return reply.status(409).send({ error: error.message })
      return reply.status(201).send(data)
    },
  )

  // PUT /skills/:id
  app.put(
    '/skills/:id',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Atualizar skill',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            name: { type: 'string' },
            max_level: { type: 'integer', minimum: 1, maximum: 20 },
            type: { type: 'string', enum: ['active', 'passive', 'toggle'] },
            element: { type: 'string', nullable: true },
            description: { type: 'string' },
            requires: {
              type: 'array',
              items: {
                type: 'object',
                required: ['skillId', 'level'],
                properties: {
                  skillId: { type: 'string' },
                  level: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const parsed = SkillUpdateSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('skills').update(parsed.data).eq('id', id).select().single()
      if (error) return reply.status(404).send({ error: 'Skill not found' })
      return data
    },
  )

  // DELETE /skills/:id
  app.delete(
    '/skills/:id',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Remover skill',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { error } = await supabase.from('skills').delete().eq('id', id)
      if (error) return reply.status(404).send({ error: 'Skill not found' })
      return reply.status(204).send()
    },
  )
}

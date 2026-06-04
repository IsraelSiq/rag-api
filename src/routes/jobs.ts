import type { FastifyInstance } from 'fastify'
import { supabase } from '../db/supabase'
import { JobCreateSchema, JobUpdateSchema } from '../schemas/job'

export async function jobRoutes(app: FastifyInstance) {
  // GET /jobs
  app.get(
    '/jobs',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Listar todas as classes',
        querystring: {
          type: 'object',
          properties: {
            tier: { type: 'integer', minimum: 1, maximum: 5 },
            expanded: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { tier, expanded } = req.query as { tier?: number; expanded?: boolean }
      let query = supabase.from('jobs').select('*').order('tier').order('name')
      if (tier !== undefined) query = query.eq('tier', tier)
      if (expanded !== undefined) query = query.eq('expanded', expanded)
      const { data, error } = await query
      if (error) return reply.status(500).send({ error: error.message })
      return data
    },
  )

  // GET /jobs/:id
  app.get(
    '/jobs/:id',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Buscar classe por ID',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { data, error } = await supabase.from('jobs').select('*').eq('id', id).single()
      if (error) return reply.status(404).send({ error: 'Job not found' })
      return data
    },
  )

  // POST /jobs
  app.post(
    '/jobs',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Criar nova classe',
        body: {
          type: 'object',
          required: ['id', 'name', 'tier', 'skill_points'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            tier: { type: 'integer', minimum: 1, maximum: 5 },
            parent_id: { type: 'string', nullable: true },
            skill_points: { type: 'integer', minimum: 0 },
            icon: { type: 'string', nullable: true },
            expanded: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (req, reply) => {
      const parsed = JobCreateSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('jobs').insert(parsed.data).select().single()
      if (error) return reply.status(409).send({ error: error.message })
      return reply.status(201).send(data)
    },
  )

  // PUT /jobs/:id
  app.put(
    '/jobs/:id',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Atualizar classe',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tier: { type: 'integer', minimum: 1, maximum: 5 },
            parent_id: { type: 'string', nullable: true },
            skill_points: { type: 'integer', minimum: 0 },
            icon: { type: 'string', nullable: true },
            expanded: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const parsed = JobUpdateSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('jobs').update(parsed.data).eq('id', id).select().single()
      if (error) return reply.status(404).send({ error: 'Job not found' })
      return data
    },
  )

  // DELETE /jobs/:id
  app.delete(
    '/jobs/:id',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Remover classe',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { error } = await supabase.from('jobs').delete().eq('id', id)
      if (error) return reply.status(404).send({ error: 'Job not found' })
      return reply.status(204).send()
    },
  )
}

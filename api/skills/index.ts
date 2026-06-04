import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../lib/supabase'
import { SkillCreateSchema } from '../../lib/schemas'
import { cors, handleOptions } from '../../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  // GET /api/skills
  if (req.method === 'GET') {
    const { job_id, type } = req.query as { job_id?: string; type?: string }
    let query = supabase.from('skills').select('*').order('name')
    if (job_id) query = query.eq('job_id', job_id)
    if (type) query = query.eq('type', type)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST /api/skills
  if (req.method === 'POST') {
    const parsed = SkillCreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const { data, error } = await supabase.from('skills').insert(parsed.data).select().single()
    if (error) return res.status(409).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

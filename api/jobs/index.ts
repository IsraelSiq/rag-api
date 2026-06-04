import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../lib/supabase'
import { JobCreateSchema } from '../../lib/schemas'
import { cors, handleOptions } from '../../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  // GET /api/jobs
  if (req.method === 'GET') {
    const { tier, expanded } = req.query as { tier?: string; expanded?: string }
    let query = supabase.from('jobs').select('*').order('tier').order('name')
    if (tier) query = query.eq('tier', Number(tier))
    if (expanded !== undefined) query = query.eq('expanded', expanded === 'true')
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST /api/jobs
  if (req.method === 'POST') {
    const parsed = JobCreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const { data, error } = await supabase.from('jobs').insert(parsed.data).select().single()
    if (error) return res.status(409).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

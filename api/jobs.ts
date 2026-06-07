import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { JobCreateSchema } from '../lib/schemas'
import { cors, handleOptions } from '../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  try {
    const supabase = getSupabase()

    if (req.method === 'GET') {
      const tier = req.query.tier ? Number(req.query.tier) : undefined
      const expanded = req.query.expanded !== undefined ? req.query.expanded === 'true' : undefined
      let query = supabase.from('jobs').select('*').order('tier').order('name')
      if (tier !== undefined) query = query.eq('tier', tier)
      if (expanded !== undefined) query = query.eq('expanded', expanded)
      const { data, error } = await query
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const parsed = JobCreateSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('jobs').insert(parsed.data as any).select().single()
      if (error) return res.status(409).json({ error: error.message })
      return res.status(201).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

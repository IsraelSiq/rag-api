import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  const q = (req.query.q as string ?? '').trim()
  const limit = Math.min(Number(req.query.limit ?? 10), 50)
  const job_id = req.query.job_id as string | undefined

  if (!q) {
    return res.status(400).json({ error: 'Query param "q" is required.' })
  }

  try {
    const supabase = getSupabase()

    let query = supabase
      .from('skills')
      .select('id, name, type, element, max_level, description, job_id, requires')
      .textSearch('fts', q, { type: 'plain', config: 'portuguese' })
      .limit(limit)

    if (job_id) {
      query = query.eq('job_id', job_id)
    }

    const { data, error } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      q,
      total: data.length,
      results: data,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

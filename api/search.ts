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

    // Primary: full-text search (simple config = no aggressive stemming)
    let ftsQuery = supabase
      .from('skills')
      .select('id, name, type, element, max_level, description, job_id, requires')
      .textSearch('fts', q, { type: 'plain', config: 'simple' })
      .limit(limit)

    if (job_id) ftsQuery = ftsQuery.eq('job_id', job_id)

    const { data: ftsData, error: ftsError } = await ftsQuery

    if (ftsError) {
      return res.status(500).json({ error: ftsError.message })
    }

    // Fallback: ilike search on name + description when FTS returns nothing
    let results = ftsData ?? []
    if (results.length === 0) {
      const pattern = `%${q}%`
      let ilikeQuery = supabase
        .from('skills')
        .select('id, name, type, element, max_level, description, job_id, requires')
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .limit(limit)

      if (job_id) ilikeQuery = ilikeQuery.eq('job_id', job_id)

      const { data: ilikeData, error: ilikeError } = await ilikeQuery
      if (ilikeError) return res.status(500).json({ error: ilikeError.message })
      results = ilikeData ?? []
    }

    return res.status(200).json({
      q,
      total: results.length,
      results,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

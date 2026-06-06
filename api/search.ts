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
    const select = 'id, name, type, element, max_level, description, job_id, requires'

    // Run FTS and ilike in parallel
    const [ftsRes, ilikeRes] = await Promise.all([
      (() => {
        let q1 = supabase
          .from('skills')
          .select(select)
          .textSearch('fts', q, { type: 'plain', config: 'simple' })
          .limit(limit)
        if (job_id) q1 = q1.eq('job_id', job_id)
        return q1
      })(),
      (() => {
        const pattern = `%${q}%`
        let q2 = supabase
          .from('skills')
          .select(select)
          .or(`name.ilike.${pattern},description.ilike.${pattern}`)
          .limit(limit)
        if (job_id) q2 = q2.eq('job_id', job_id)
        return q2
      })(),
    ])

    if (ftsRes.error) return res.status(500).json({ error: ftsRes.error.message })
    if (ilikeRes.error) return res.status(500).json({ error: ilikeRes.error.message })

    // Merge and deduplicate by id, preserving order (FTS first)
    const seen = new Set<string>()
    const merged = [...(ftsRes.data ?? []), ...(ilikeRes.data ?? [])].filter(s => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    }).slice(0, limit)

    return res.status(200).json({
      q,
      total: merged.length,
      results: merged,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

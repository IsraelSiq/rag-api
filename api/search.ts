import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

// Synonym map: expand query terms to related words
const SYNONYMS: Record<string, string[]> = {
  cura:       ['cura', 'recupera', 'restaura', 'revive', 'ressuscita', 'heal', 'absorve'],
  dano:       ['dano', 'ataque', 'golpe', 'dispara', 'explode', 'perfura'],
  veneno:     ['veneno', 'envenenado', 'venenoso', 'toxina'],
  invisivel:  ['invisível', 'invisibilidade', 'hiding', 'oculto', 'cloaking'],
  teletransporte: ['teletransporte', 'teletransporta', 'portal', 'warp'],
  buff:       ['buff', 'aumenta', 'bônus', 'fortalece', 'incrementa'],
  aoe:        ['aoe', 'área', 'ao redor', 'todos os inimigos', 'chuva'],
  stun:       ['stun', 'atordoa', 'paralisa'],
  sagrado:    ['sagrado', 'holy', 'divino', 'bênção'],
  escudo:     ['escudo', 'bloqueia', 'absorve', 'barreira', 'proteção'],
}

function expandQuery(q: string): string[] {
  const lower = q.toLowerCase()
  const terms = SYNONYMS[lower] ?? [lower]
  return [...new Set(terms)]
}

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
    const terms = expandQuery(q)

    // Build ilike OR pattern for all synonym terms
    const ilikeFilter = terms
      .flatMap(t => [`name.ilike.%${t}%`, `description.ilike.%${t}%`])
      .join(',')

    // Run FTS (original query) and expanded ilike in parallel
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
        let q2 = supabase
          .from('skills')
          .select(select)
          .or(ilikeFilter)
          .limit(limit)
        if (job_id) q2 = q2.eq('job_id', job_id)
        return q2
      })(),
    ])

    if (ftsRes.error) return res.status(500).json({ error: ftsRes.error.message })
    if (ilikeRes.error) return res.status(500).json({ error: ilikeRes.error.message })

    // Merge and deduplicate by id (FTS results first)
    const seen = new Set<string>()
    const merged = [...(ftsRes.data ?? []), ...(ilikeRes.data ?? [])]
      .filter(s => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      })
      .slice(0, limit)

    return res.status(200).json({
      q,
      expanded_terms: terms,
      total: merged.length,
      results: merged,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

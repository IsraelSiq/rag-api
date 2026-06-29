// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

const SYNONYMS: Record<string, string[]> = {
  cura:           ['cura', 'recupera', 'restaura', 'revive', 'ressuscita', 'heal', 'absorve'],
  dano:           ['dano', 'ataque', 'golpe', 'dispara', 'explode', 'perfura'],
  veneno:         ['veneno', 'envenenado', 'venenoso', 'toxina'],
  invisivel:      ['invisível', 'invisibilidade', 'hiding', 'oculto', 'cloaking'],
  teletransporte: ['teletransporte', 'teletransporta', 'portal', 'warp'],
  buff:           ['buff', 'aumenta', 'bônus', 'fortalece', 'incrementa'],
  aoe:            ['aoe', 'área', 'ao redor', 'todos os inimigos', 'chuva'],
  stun:           ['stun', 'atordoa', 'paralisa'],
  sagrado:        ['sagrado', 'holy', 'divino', 'bênção'],
  escudo:         ['escudo', 'bloqueia', 'absorve', 'barreira', 'proteção'],
}

function expandQuery(q: string): string[] {
  const lower = q.toLowerCase()
  return [...new Set(SYNONYMS[lower] ?? [lower])]
}

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'embed-multilingual-v3.0',
        texts: [text],
        input_type: 'search_query',
        embedding_types: ['float'],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.embeddings.float[0]
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  const q = ((req.query.q as string) ?? '').trim()
  const limit = Math.min(Number(req.query.limit ?? 10), 50)
  const threshold = Number(req.query.threshold ?? 0.3)
  const job_id = req.query.job_id as string | undefined

  if (!q) {
    return res.status(400).json({ error: 'Query param "q" is required.' })
  }

  try {
    const supabase = getSupabase()
    const select = 'id, name, type, element, max_level, description, job_id, requires'

    if (process.env.COHERE_API_KEY) {
      const embedding = await getEmbedding(q)
      if (embedding) {
        const { data: semanticData, error: semanticError } = await supabase.rpc('match_skills', {
          query_embedding: embedding,
          match_count: limit,
          match_threshold: threshold,
          filter_job_id: job_id ?? null,
        })
        if (!semanticError && semanticData && semanticData.length > 0) {
          return res.status(200).json({ q, mode: 'semantic', total: semanticData.length, results: semanticData })
        }
      }
    }

    const terms = expandQuery(q)
    const ilikeFilter = terms
      .flatMap(t => [`name.ilike.%${t}%`, `description.ilike.%${t}%`])
      .join(',')

    const [ftsRes, ilikeRes] = await Promise.all([
      (() => {
        let q1 = supabase.from('skills').select(select).textSearch('fts', q, { type: 'plain', config: 'simple' }).limit(limit)
        if (job_id) q1 = q1.eq('job_id', job_id)
        return q1
      })(),
      (() => {
        let q2 = supabase.from('skills').select(select).or(ilikeFilter).limit(limit)
        if (job_id) q2 = q2.eq('job_id', job_id)
        return q2
      })(),
    ])

    if (ftsRes.error) return res.status(500).json({ error: ftsRes.error.message })
    if (ilikeRes.error) return res.status(500).json({ error: ilikeRes.error.message })

    const seen = new Set()
    const merged = [...(ftsRes.data ?? []), ...(ilikeRes.data ?? [])]
      .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
      .slice(0, limit)

    return res.status(200).json({ q, mode: 'keyword', expanded_terms: terms, total: merged.length, results: merged })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

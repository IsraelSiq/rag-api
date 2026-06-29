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
  str:            ['str', 'força', 'force', 'strength'],
  agi:            ['agi', 'agilidade', 'agility', 'velocidade'],
  int:            ['int', 'inteligência', 'intelligence', 'magia'],
  vit:            ['vit', 'vitalidade', 'vitality', 'defesa'],
  dex:            ['dex', 'destreza', 'dexterity', 'precisão'],
  luk:            ['luk', 'sorte', 'luck'],
}

function expandQuery(q: string): string[] {
  const lower = q.toLowerCase()
  return [...new Set(SYNONYMS[lower] ?? [lower])]
}

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
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
  } catch { return null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })

  const q         = ((req.query.q as string) ?? '').trim()
  const limit     = Math.min(Number(req.query.limit ?? 10), 50)
  const threshold = Number(req.query.threshold ?? 0.3)
  const job_id    = req.query.job_id as string | undefined
  // ?type=skills | items | all  (default: all)
  const type      = (req.query.type as string) ?? 'all'

  if (!q) return res.status(400).json({ error: 'Query param "q" is required.' })

  try {
    const supabase  = getSupabase()
    const wantSkills = type === 'all' || type === 'skills'
    const wantItems  = type === 'all' || type === 'items'

    let skills: any[] = []
    let items: any[]  = []
    let mode = 'keyword'

    if (process.env.COHERE_API_KEY) {
      const embedding = await getEmbedding(q)
      if (embedding) {
        const [skillsRes, itemsRes] = await Promise.all([
          wantSkills
            ? supabase.rpc('match_skills', {
                query_embedding: embedding,
                match_count: limit,
                match_threshold: threshold,
                filter_job_id: job_id ?? null,
              })
            : Promise.resolve({ data: [], error: null }),
          wantItems
            ? supabase.rpc('match_items', {
                query_embedding: embedding,
                match_count: limit,
                match_threshold: threshold,
              })
            : Promise.resolve({ data: [], error: null }),
        ])

        if (!skillsRes.error && !itemsRes.error) {
          skills = (skillsRes.data ?? []).map(s => ({ ...s, _table: 'skill' }))
          items  = (itemsRes.data  ?? []).map(i => ({ ...i, _table: 'item'  }))
          mode   = 'semantic'

          if (skills.length > 0 || items.length > 0) {
            return res.status(200).json({ q, mode, type, skills, items, total: skills.length + items.length })
          }
        }
      }
    }

    // Fallback keyword
    const terms       = expandQuery(q)
    const ilikeSkill  = terms.flatMap(t => [`name.ilike.%${t}%`, `description.ilike.%${t}%`]).join(',')
    const ilikeItem   = terms.flatMap(t => [`name.ilike.%${t}%`, `description.ilike.%${t}%`]).join(',')
    const skillSelect = 'id, name, type, element, max_level, description, job_id, requires'
    const itemSelect  = 'id, name, type, sub_type, slots, description'

    const queries: Promise<any>[] = []
    if (wantSkills) {
      let sq = supabase.from('skills').select(skillSelect).or(ilikeSkill).limit(limit)
      if (job_id) sq = sq.eq('job_id', job_id)
      queries.push(sq)
    } else queries.push(Promise.resolve({ data: [], error: null }))

    if (wantItems) {
      queries.push(supabase.from('items').select(itemSelect).or(ilikeItem).limit(limit))
    } else queries.push(Promise.resolve({ data: [], error: null }))

    const [sRes, iRes] = await Promise.all(queries)
    if (sRes.error) return res.status(500).json({ error: sRes.error.message })
    if (iRes.error) return res.status(500).json({ error: iRes.error.message })

    skills = (sRes.data ?? []).map(s => ({ ...s, _table: 'skill' }))
    items  = (iRes.data  ?? []).map(i => ({ ...i, _table: 'item'  }))

    return res.status(200).json({
      q, mode: 'keyword', type, expanded_terms: terms,
      skills, items, total: skills.length + items.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

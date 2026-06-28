import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()

  try {
    const {
      stat,
      min = '1',
      job,
      type,
      subtype,
      q,
      limit = '20',
      offset = '0',
    } = req.query as Record<string, string>

    const limitN  = Math.min(parseInt(limit, 10) || 20, 100)
    const offsetN = parseInt(offset, 10) || 0

    // Filtro por stat com valor mínimo
    if (stat) {
      let query = supabase
        .from('item_bonuses')
        .select(`
          stat, value, condition, skill_mod,
          items!inner ( id, name, type, sub_type, slots, weight, description )
        `)
        .eq('stat', stat.toLowerCase())
        .gte('value', parseInt(min, 10) || 1)
        .order('value', { ascending: false })
        .range(offsetN, offsetN + limitN - 1)

      if (job) query = query.or(`job_id.eq.${job},job_id.is.null`)

      const { data, error } = await query
      if (error) return res.status(500).json({ error: error.message })

      return res.status(200).json({
        stat,
        min: parseInt(min, 10),
        total: data?.length ?? 0,
        results: data,
      })
    }

    // Listagem geral com filtros opcionais
    let query = supabase
      .from('items')
      .select('id, name, type, sub_type, slots, weight, description, source')
      .range(offsetN, offsetN + limitN - 1)
      .order('name')

    if (type)    query = query.eq('type', parseInt(type, 10))
    if (subtype) query = query.eq('sub_type', parseInt(subtype, 10))
    if (q)       query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ total: data?.length ?? 0, results: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

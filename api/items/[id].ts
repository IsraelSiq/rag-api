import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../../lib/supabase'
import { cors, handleOptions } from '../../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query as { id: string }
  const supabase = getSupabase()

  try {
    const [itemRes, bonusRes, skillModRes] = await Promise.all([
      supabase
        .from('items')
        .select('id, name, type, sub_type, slots, weight, description, dp_data, source, created_at')
        .eq('id', id)
        .single(),

      supabase
        .from('item_bonuses')
        .select('stat, value, condition, job_id, skill_mod, is_card')
        .eq('item_id', id)
        .order('value', { ascending: false }),

      supabase
        .from('item_skill_mods')
        .select('skill_id, mod_type, mod_value')
        .eq('item_id', id),
    ])

    if (itemRes.error || !itemRes.data) {
      return res.status(404).json({ error: 'Item not found' })
    }

    // Busca combos que contenham este item
    const { data: combos } = await supabase
      .from('item_combos')
      .select('name, item_ids, bonus_stat, bonus_value, description')
      .contains('item_ids', [id])

    // Calcula sumário de bônus (potencial máximo por stat)
    const bonusSummary: Record<string, number> = {}
    for (const b of bonusRes.data ?? []) {
      if (b.condition === 'always' || b.condition === null) {
        bonusSummary[b.stat] = (bonusSummary[b.stat] ?? 0) + b.value
      }
    }

    return res.status(200).json({
      ...itemRes.data,
      bonuses: bonusRes.data ?? [],
      bonus_summary: bonusSummary,
      skill_mods: skillModRes.data ?? [],
      combos: combos ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

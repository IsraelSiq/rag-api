// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

// ---- inline data (mantido idêntico ao original) ----
const JOBS = [
  { id: 'novice', name: 'Novice', tier: 1, skill_points: 9, expanded: true },
  { id: 'swordsman', name: 'Swordsman', tier: 2, skill_points: 42, expanded: false },
  { id: 'mage', name: 'Mage', tier: 2, skill_points: 45, expanded: false },
  { id: 'archer', name: 'Archer', tier: 2, skill_points: 42, expanded: false },
  { id: 'merchant', name: 'Merchant', tier: 2, skill_points: 42, expanded: false },
  { id: 'thief', name: 'Thief', tier: 2, skill_points: 42, expanded: false },
  { id: 'acolyte', name: 'Acolyte', tier: 2, skill_points: 42, expanded: false },
  { id: 'knight', name: 'Knight', tier: 3, parent_id: 'swordsman', skill_points: 72, expanded: false },
  { id: 'crusader', name: 'Crusader', tier: 3, parent_id: 'swordsman', skill_points: 65, expanded: false },
  { id: 'wizard', name: 'Wizard', tier: 3, parent_id: 'mage', skill_points: 72, expanded: false },
  { id: 'sage', name: 'Sage', tier: 3, parent_id: 'mage', skill_points: 72, expanded: false },
  { id: 'hunter', name: 'Hunter', tier: 3, parent_id: 'archer', skill_points: 72, expanded: false },
  { id: 'bard', name: 'Bard', tier: 3, parent_id: 'archer', skill_points: 72, expanded: false },
  { id: 'dancer', name: 'Dancer', tier: 3, parent_id: 'archer', skill_points: 72, expanded: false },
  { id: 'blacksmith', name: 'Blacksmith', tier: 3, parent_id: 'merchant', skill_points: 72, expanded: false },
  { id: 'alchemist', name: 'Alchemist', tier: 3, parent_id: 'merchant', skill_points: 72, expanded: false },
  { id: 'assassin', name: 'Assassin', tier: 3, parent_id: 'thief', skill_points: 72, expanded: false },
  { id: 'rogue', name: 'Rogue', tier: 3, parent_id: 'thief', skill_points: 72, expanded: false },
  { id: 'priest', name: 'Priest', tier: 3, parent_id: 'acolyte', skill_points: 72, expanded: false },
  { id: 'monk', name: 'Monk', tier: 3, parent_id: 'acolyte', skill_points: 72, expanded: false },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const secret = process.env.SEED_SECRET
  const provided = req.headers['x-seed-secret']
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  try {
    const supabase = getSupabase()
    const { error: jobsError } = await supabase.from('jobs').upsert(JOBS as any)
    if (jobsError) return res.status(500).json({ error: jobsError.message })
    return res.status(200).json({ ok: true, message: `Seeded ${JOBS.length} jobs.` })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

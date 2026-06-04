import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { SkillUpdateSchema } from '../lib/schemas'
import { cors, handleOptions } from '../lib/helpers'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  const { id } = req.query as { id: string }

  try {
    const supabase = getSupabase()

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('skills').select('*').eq('id', id).single()
      if (error) return res.status(404).json({ error: 'Skill not found' })
      return res.status(200).json(data)
    }

    if (req.method === 'PUT') {
      const parsed = SkillUpdateSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
      const { data, error } = await supabase.from('skills').update(parsed.data).eq('id', id).select().single()
      if (error) return res.status(404).json({ error: 'Skill not found' })
      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('skills').delete().eq('id', id)
      if (error) return res.status(404).json({ error: 'Skill not found' })
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

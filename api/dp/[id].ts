import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDpItem } from '../../lib/divinePride'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'item id obrigatório' })
  }

  const item = await getDpItem(id)
  if (!item) {
    return res.status(404).json({ error: `Item ${id} não encontrado` })
  }

  // cache no browser por 1h
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json(item)
}

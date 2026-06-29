import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeItemBonuses } from '../../lib/divine-pride-scraper';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'item id required' });
  }

  try {
    const bonuses = await scrapeItemBonuses(id);
    return res.status(200).json({ item_id: id, bonuses });
  } catch (e: any) {
    console.error('[item-bonuses]', e);
    return res.status(500).json({ error: e.message });
  }
}

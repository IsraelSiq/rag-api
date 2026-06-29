/**
 * POST /api/ingest/divine-pride
 * Pipeline de ingestão: Divine Pride API → Supabase (items + item_bonuses)
 *
 * Body: { type?: number, ids?: number[], dry_run?: boolean }
 * Header: x-cron-secret (obrigatório fora de desenvolvimento)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../../lib/supabase'
import { cors, handleOptions } from '../../lib/helpers'
import { fetchItem, fetchItemsByType, getBonusScript, type DPItemType } from '../../lib/divine-pride'
import { parseBonusScript } from '../../lib/bonus-parser'

type ItemBonusInsert = {
  item_id:   string
  stat:      string
  value:     number
  condition: string
  job_id:    string | null
  skill_mod: string | null
}

function authCheck(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers['x-cron-secret'] === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!authCheck(req)) return res.status(401).json({ error: 'Unauthorized' })

  const {
    type,
    ids,
    dry_run = false,
  } = (req.body ?? {}) as { type?: number; ids?: number[]; dry_run?: boolean }

  const report = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] }
  // cast para any: o cliente supabase sem Database genérico rejeita tabelas customizadas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabase() as any

  try {
    let itemIds: number[] = []

    if (ids && ids.length > 0) {
      itemIds = ids
    } else if (type !== undefined) {
      console.log(`[ingest] Buscando itens do tipo ${type} na Divine Pride...`)
      const list = await fetchItemsByType(type as DPItemType, {
        onPage: (items, page) => console.log(`[ingest] Página ${page}: ${items.length} itens`),
      })
      itemIds = list.map((i: { id: number }) => i.id)
    } else {
      return res.status(400).json({ error: 'Informe type ou ids no body' })
    }

    console.log(`[ingest] Total de IDs a processar: ${itemIds.length}`)

    for (const id of itemIds) {
      try {
        const dpItem = await fetchItem(id)
        if (!dpItem) { report.skipped++; continue }

        const script = getBonusScript(dpItem)
        const bonuses = parseBonusScript(script)

        if (dry_run) {
          console.log(`[dry_run] #${id} ${dpItem.name} → ${bonuses.length} bônus`)
          continue
        }

        const { error: upsertErr } = await supabase.from('items').upsert({
          id:          String(id),
          name:        dpItem.name,
          type:        dpItem.itemTypeId,
          sub_type:    dpItem.itemSubTypeId ?? null,
          slots:       dpItem.slots ?? 0,
          weight:      dpItem.weight ?? null,
          description: dpItem.description ?? null,
          raw_bonus:   script || null,
          dp_data:     dpItem as unknown as Record<string, unknown>,
          source:      'divine_pride',
        })

        if (upsertErr) { report.errors.push(`#${id}: ${upsertErr.message}`); continue }

        if (bonuses.length > 0) {
          await supabase.from('item_bonuses').delete().eq('item_id', String(id))

          const rows: ItemBonusInsert[] = bonuses.map((b: ItemBonusInsert) => ({
            item_id:   String(id),
            stat:      b.stat,
            value:     b.value,
            condition: b.condition,
            job_id:    b.job_id ?? null,
            skill_mod: b.skill_mod ?? null,
          }))

          await supabase.from('item_bonuses').insert(rows)
        }

        report.inserted++

        await new Promise<void>(r => setTimeout(r, 1000))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        report.errors.push(`#${id}: ${msg}`)
      }
    }

    return res.status(200).json({ dry_run, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

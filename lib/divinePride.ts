import { supabaseAdmin } from './supabase'

const DP_API_KEY = process.env.DIVINE_PRIDE_API_KEY ?? ''
const DP_BASE    = 'https://www.divine-pride.net/api/database'
const CACHE_TTL_DAYS = 30

export async function getDpItem(itemId: string | number): Promise<DpItem | null> {
  const id = String(itemId)

  // 1. tenta cache
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CACHE_TTL_DAYS)

  const { data: cached } = await supabaseAdmin
    .from('dp_item_cache')
    .select('data, fetched_at')
    .eq('item_id', id)
    .gte('fetched_at', cutoff.toISOString())
    .maybeSingle()

  if (cached) return cached.data as DpItem

  // 2. busca no Divine Pride
  const url = `${DP_BASE}/item/${id}?apiKey=${DP_API_KEY}&server=bRO`
  const res  = await fetch(url)
  if (!res.ok) return null

  const json = await res.json() as DpItem

  // 3. salva no cache (upsert)
  await supabaseAdmin
    .from('dp_item_cache')
    .upsert({ item_id: id, data: json, fetched_at: new Date().toISOString() })

  return json
}

// ---- tipos mínimos do Divine Pride ----
export interface DpItem {
  id:          number
  name:        string
  unidName?:   string
  slots:       number
  weight:      number
  attack?:     number
  defense?:    number
  equipLevel?: number
  itemTypeId:  number
  subType?:    number
  location?:   number          // bitmask de slots
  script?:     string          // script LUA raw
  unEquipScript?: string
  description?: string
  // Divine Pride normalizado
  itemScript?: DpScriptLine[]
  // obtainInfo
  obtainedFrom?: DpObtainSource[]
  [key: string]: unknown
}

export interface DpScriptLine {
  type:   string   // e.g. 'bonus', 'skill', 'if'
  values: unknown[]
  description?: string
}

export interface DpObtainSource {
  method:  string  // 'drop', 'quest', 'npc', 'craft'
  details: unknown
}

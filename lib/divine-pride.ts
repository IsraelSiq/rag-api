/**
 * divine-pride.ts
 * Cliente HTTP tipado para a Divine Pride API.
 * Documentação: https://www.divine-pride.net/api
 */

const BASE_URL = 'https://www.divine-pride.net/api/database'

/** Tipos de item da Divine Pride */
export const DP_ITEM_TYPES = {
  HEALING: 0,
  USABLE: 2,
  ETC: 3,
  WEAPON: 4,
  ARMOR: 5,
  CARD: 6,
  PET_EGG: 7,
  PET_EQUIPMENT: 8,
  AMMO: 10,
  USABLE_SKILL: 11,
  SHADOW: 18,
} as const

export type DPItemType = typeof DP_ITEM_TYPES[keyof typeof DP_ITEM_TYPES]

export interface DPItem {
  id: number
  name: string
  itemTypeId: number
  itemSubTypeId: number | null
  slots: number
  weight: number
  attack: number | null
  matk: number | null
  defense: number | null
  equipmentLevelId: number | null
  minimumAttributeValue: number | null
  itemScript: string | null       // bônus ao equipar
  equipScript: string | null      // bônus ao equipar (alternativo)
  unEquipScript: string | null    // bônus ao desequipar
  description: string | null
  isAvailable: boolean
  isTradeable: boolean
  price: number | null
  illustration: string | null     // URL da imagem
}

export interface DPItemListEntry {
  id: number
  name: string
  itemTypeId: number
}

function getApiKey(): string {
  const key = process.env.DIVINE_PRIDE_API_KEY
  if (!key) throw new Error('DIVINE_PRIDE_API_KEY não configurada')
  return key
}

/** Busca um item por ID */
export async function fetchItem(id: number): Promise<DPItem | null> {
  const url = `${BASE_URL}/item/${id}?apiKey=${getApiKey()}&server=iRO`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Divine Pride API erro ${res.status}: ${url}`)
  return res.json() as Promise<DPItem>
}

/** Lista itens por tipo com rate limiting (1 req/s) */
export async function fetchItemsByType(
  type: DPItemType,
  opts: { maxPages?: number; onPage?: (items: DPItemListEntry[], page: number) => void } = {}
): Promise<DPItemListEntry[]> {
  const { maxPages = 50, onPage } = opts
  const all: DPItemListEntry[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE_URL}/item?type=${type}&page=${page}&apiKey=${getApiKey()}&server=iRO`
    const res = await fetch(url)
    if (!res.ok) break

    const data = await res.json() as { items?: DPItemListEntry[] }
    const items = data.items ?? []
    if (items.length === 0) break

    all.push(...items)
    onPage?.(items, page)

    // Rate limit respeitoso: 1 req/s
    if (page < maxPages) await new Promise(r => setTimeout(r, 1000))
  }

  return all
}

/** Retorna o script de bônus ativo do item (itemScript ou equipScript) */
export function getBonusScript(item: DPItem): string {
  return (item.itemScript ?? item.equipScript ?? '').trim()
}

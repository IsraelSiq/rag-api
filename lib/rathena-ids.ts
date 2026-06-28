/**
 * rathena-ids.ts
 *
 * Baixa os YAMLs do rAthena (GitHub) e extrai:
 *   - ID numérico
 *   - AegisName / Name
 *   - Tipo (Weapon=4, Armor=5, Card=6, Shadow=18, etc.)
 *   - ItemScript bruto
 *
 * Fontes:
 *   item_db_equip.yml → Weapons, Armors, Shadowgear
 *   item_db_etc.yml   → Cards
 *
 * Usado para contornar o bloqueio de listagem da Divine Pride API.
 */

const RATHENA_BASE = 'https://raw.githubusercontent.com/rathena/rathena/master/db/re'
const EQUIP_URL   = `${RATHENA_BASE}/item_db_equip.yml`
const ETC_URL     = `${RATHENA_BASE}/item_db_etc.yml`

// Mapa: string do YAML → itemTypeId numérico (mesmo padrão Divine Pride)
export const RATHENA_TYPE_MAP: Record<string, number> = {
  Healing:     0,
  Usable:      2,
  Etc:         3,
  Weapon:      4,
  Armor:       5,
  Card:        6,
  PetEgg:      7,
  PetEquip:    8,
  Ammo:        10,
  UsableSkill: 11,
  Shadow:      18,  // alias legado
  Shadowgear:  18,  // rótulo real no YAML do rAthena
}

export interface RAthenaItem {
  id:          number
  aegisName:   string
  rathenaName: string | null   // campo Name: do YAML (fallback para dpItem.name)
  typeId:      number
  typeRaw:     string
  script:      string | null
  equipScript: string | null
}

/**
 * Baixa equip + etc, combina e retorna todos os itens.
 */
export async function fetchRAthenaEquipIds(): Promise<RAthenaItem[]> {
  const [equipText, etcText] = await Promise.all([
    fetchText(EQUIP_URL),
    fetchText(ETC_URL),
  ])
  return [
    ...parseRAthenaYAML(equipText),
    ...parseRAthenaYAML(etcText),
  ]
}

/** Filtra pelo(s) typeId(s) desejado(s). */
export function filterByType(items: RAthenaItem[], typeIds: number[]): RAthenaItem[] {
  const set = new Set(typeIds)
  return items.filter(i => set.has(i.typeId))
}

// ─── Internos ────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`rAthena download falhou (${res.status}): ${url}`)
  return res.text()
}

function parseRAthenaYAML(yaml: string): RAthenaItem[] {
  const items: RAthenaItem[] = []
  const raw    = yaml.replace(/^Body:\s*\n/m, '')
  const blocks = raw.split(/(?=^  - Id:)/m)

  for (const block of blocks) {
    if (!block.trim()) continue

    // ── ID ──────────────────────────────────────────────────────────────────
    const idMatch = block.match(/^\s*-\s*Id:\s*(\d+)/m)
    if (!idMatch) continue
    const id = parseInt(idMatch[1], 10)

    // ── AegisName ───────────────────────────────────────────────────────────
    const aegisMatch = block.match(/^\s+AegisName:\s*(\S+)/m)
    const aegisName  = aegisMatch?.[1] ?? ''

    // ── Name (campo legível) ─────────────────────────────────────────────────
    // Pode ser quoted ou não: Name: Knife  /  Name: "Knife [3]"
    const nameMatch  = block.match(/^\s+Name:\s*["']?(.+?)["']?\s*$/m)
    const rathenaName = nameMatch?.[1]?.trim() ?? null

    // ── Tipo ────────────────────────────────────────────────────────────────
    const typeMatch = block.match(/^\s+Type:\s*(\S+)/m)
    const typeRaw   = typeMatch?.[1] ?? 'Etc'
    const typeId    = RATHENA_TYPE_MAP[typeRaw] ?? 3

    // ── Scripts ─────────────────────────────────────────────────────────────
    const script      = extractScriptBlock(block, 'Script')
    const equipScript = extractScriptBlock(block, 'OnEquipScript')

    items.push({ id, aegisName, rathenaName, typeId, typeRaw, script, equipScript })
  }

  return items
}

function extractScriptBlock(block: string, fieldName: string): string | null {
  // Bloco multilinha:  Script: |\n    bonus bStr,3;
  const multiRe = new RegExp(
    `^(\\s+)${fieldName}:\\s*\\|\\n([\\s\\S]*?)(?=\\n\\1\\S|\\n  - Id:|$)`,
    'm'
  )
  const multiMatch = block.match(multiRe)
  if (multiMatch) {
    const indent  = multiMatch[1].length + 2
    const cleaned = multiMatch[2]
      .split('\n')
      .map(l => l.slice(indent))
      .join('\n')
      .trim()
    return cleaned || null
  }

  // Inline:  Script: bonus bStr,3;
  const inlineRe    = new RegExp(`^\\s+${fieldName}:\\s*(.+)$`, 'm')
  const inlineMatch = block.match(inlineRe)
  if (inlineMatch) {
    const val = inlineMatch[1].trim()
    if (val === '|' || val === '{}' || val === '') return null
    return val
  }

  return null
}

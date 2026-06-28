/**
 * rathena-ids.ts
 *
 * Baixa o item_db_equip.yml do rAthena (GitHub) e extrai:
 *   - ID numérico
 *   - AegisName
 *   - Tipo (Weapon=4, Armor=5, Card=6, Shadow=18, etc.)
 *   - ItemScript bruto (bonus script completo)
 *
 * Usado como fonte de IDs para contornar o bloqueio de listagem
 * da Divine Pride API (endpoint ?type=N retorna HTML/Cloudflare).
 *
 * O item individual /Item/{id} da Divine Pride ainda é chamado para
 * complementar com nome, slots, peso, descrição, imagem, etc.
 */

const RATHENA_EQUIP_URL =
  'https://raw.githubusercontent.com/rathena/rathena/master/db/re/item_db_equip.yml'

// Mapa: string do YAML → itemTypeId numérico (mesmo padrão Divine Pride)
export const RATHENA_TYPE_MAP: Record<string, number> = {
  Healing:    0,
  Usable:     2,
  Etc:        3,
  Weapon:     4,
  Armor:      5,
  Card:       6,
  PetEgg:     7,
  PetEquip:   8,
  Ammo:       10,
  UsableSkill:11,
  Shadow:     18,
}

export interface RAthenaItem {
  id:          number
  aegisName:   string
  typeId:      number          // itemTypeId numérico
  typeRaw:     string          // string original do YAML (ex: 'Weapon')
  script:      string | null   // ItemScript bruto
  equipScript: string | null   // OnEquipScript (se existir separado)
}

/**
 * Faz o download do item_db_equip.yml do rAthena e parseia cada item.
 * Retorna array com todos os equipamentos (~13 mil registros).
 */
export async function fetchRAthenaEquipIds(): Promise<RAthenaItem[]> {
  const res = await fetch(RATHENA_EQUIP_URL)
  if (!res.ok) throw new Error(`rAthena YAML download falhou: ${res.status}`)
  const text = await res.text()
  return parseRAthenaYAML(text)
}

/**
 * Filtra a lista pelo(s) itemTypeId(s) desejado(s).
 * Ex: filterByType(items, [4, 5]) → só Weapons e Armors
 */
export function filterByType(items: RAthenaItem[], typeIds: number[]): RAthenaItem[] {
  const set = new Set(typeIds)
  return items.filter(i => set.has(i.typeId))
}

// ─── Parser interno ──────────────────────────────────────────────────────────

/**
 * Parseia o YAML de itens do rAthena de forma leve (sem biblioteca YAML)
 * dividindo por blocos de item e extraindo campos via regex.
 *
 * A estrutura do YAML é:
 *
 *   Body:
 *     - Id: 1100
 *       AegisName: Sword
 *       Type: Weapon
 *       ...
 *       Script: |
 *         bonus bStr,3;
 *       ...
 *     - Id: 1101
 *       ...
 */
function parseRAthenaYAML(yaml: string): RAthenaItem[] {
  const items: RAthenaItem[] = []

  // Divide nos blocos de item (cada um começa com '  - Id:')
  // Inclui o ID no próprio bloco para facilitar o parse
  const raw = yaml.replace(/^Body:\s*\n/m, '')
  const blocks = raw.split(/(?=^  - Id:)/m)

  for (const block of blocks) {
    if (!block.trim()) continue

    // ── ID ──────────────────────────────────────────────────────────────────
    const idMatch = block.match(/^\s*-\s*Id:\s*(\d+)/m)
    if (!idMatch) continue
    const id = parseInt(idMatch[1], 10)

    // ── AegisName ────────────────────────────────────────────────────────────
    const nameMatch = block.match(/^\s+AegisName:\s*(\S+)/m)
    const aegisName = nameMatch?.[1] ?? ''

    // ── Tipo ─────────────────────────────────────────────────────────────────
    const typeMatch = block.match(/^\s+Type:\s*(\S+)/m)
    const typeRaw   = typeMatch?.[1] ?? 'Etc'
    const typeId    = RATHENA_TYPE_MAP[typeRaw] ?? 3

    // ── Script (bloco multilinha com '|') ────────────────────────────────────
    // Padrão:
    //     Script: |
    //       bonus bStr,3;
    //       bonus bAtk,10;
    // Ou inline:
    //     Script: bonus bStr,3;
    const script      = extractScriptBlock(block, 'Script')
    const equipScript = extractScriptBlock(block, 'OnEquipScript')

    items.push({ id, aegisName, typeId, typeRaw, script, equipScript })
  }

  return items
}

/**
 * Extrai o conteúdo de um campo de script (suporte a bloco '|' e inline).
 */
function extractScriptBlock(block: string, fieldName: string): string | null {
  // Bloco multilinha: "  Script: |\n    bonus bStr,3;"
  const multiRe = new RegExp(
    `^(\\s+)${fieldName}:\\s*\\|\\n([\\s\\S]*?)(?=\\n\\1\\S|\\n  - Id:|$)`,
    'm'
  )
  const multiMatch = block.match(multiRe)
  if (multiMatch) {
    // Remove indentação extra das linhas do bloco
    const indent = multiMatch[1].length + 2   // indentação base + 2 do bloco
    const lines  = multiMatch[2].split('\n')
    const cleaned = lines
      .map(l => l.slice(indent))              // remove indentação extra
      .join('\n')
      .trim()
    return cleaned || null
  }

  // Inline: "  Script: bonus bStr,3;"
  const inlineRe = new RegExp(`^\\s+${fieldName}:\\s*(.+)$`, 'm')
  const inlineMatch = block.match(inlineRe)
  if (inlineMatch) {
    const val = inlineMatch[1].trim()
    // Ignora valores que são apenas chaves de mapeamento YAML (ex: '|', '{}')
    if (val === '|' || val === '{}' || val === '') return null
    return val
  }

  return null
}

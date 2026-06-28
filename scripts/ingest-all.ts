/**
 * scripts/ingest-all.ts
 *
 * Ingere itens da Divine Pride API diretamente no Supabase.
 *
 * Fonte de IDs/scripts : rAthena item_db_equip.yml + item_db_etc.yml (GitHub)
 * Fonte de detalhes   : Divine Pride /item/{id} (nome, slots, peso, imagem…)
 *
 * Uso:
 *   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/ingest-all.ts
 *
 * Flags:
 *   --types=4,5,6,18   Tipos a ingerir (default: 4,5,6,18)
 *   --dry-run           Mostra sem gravar
 *   --reset             Limpa item_bonuses antes de começar
 *   --limit=100         Limita a N itens por tipo (útil para testes)
 */

import { createClient } from '@supabase/supabase-js'
import { fetchItem, getBonusScript, DP_ITEM_TYPES, type DPItemType } from '../lib/divine-pride'
import { parseBonusScript } from '../lib/bonus-parser'
import { fetchRAthenaEquipIds, filterByType, type RAthenaItem } from '../lib/rathena-ids'

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  process.exit(1)
}

const args      = process.argv.slice(2)
const DRY_RUN   = args.includes('--dry-run')
const RESET     = args.includes('--reset')
const TYPES_ARG = args.find(a => a.startsWith('--types='))
const LIMIT_ARG = args.find(a => a.startsWith('--limit='))
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity

const TYPES: DPItemType[] = TYPES_ARG
  ? TYPES_ARG.split('=')[1].split(',').map(Number) as DPItemType[]
  : [DP_ITEM_TYPES.WEAPON, DP_ITEM_TYPES.ARMOR, DP_ITEM_TYPES.CARD, DP_ITEM_TYPES.SHADOW]

const TYPE_NAMES: Record<number, string> = {
  0: 'Healing', 2: 'Usable', 3: 'Etc', 4: 'Weapon',
  5: 'Armor', 6: 'Card', 7: 'Pet Egg', 8: 'Pet Equip',
  10: 'Ammo', 11: 'Usable Skill', 18: 'Shadow',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR') }

function bar(current: number, total: number, width = 25) {
  const pct    = total > 0 ? current / total : 0
  const filled = Math.round(pct * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' +
    String(Math.round(pct * 100)).padStart(3) + '% ' +
    `(${fmt(current)}/${fmt(total)})`
}

/**
 * Resolve o nome do item com fallback em cascata:
 *   Divine Pride name → unidName → rAthena Name → aegisName (jamais nulo)
 */
function resolveName(dpName: string | null | undefined, dpUnid: string | null | undefined, rathenaName: string | null, aegisName: string): string {
  return dpName?.trim() || dpUnid?.trim() || rathenaName?.trim() || aegisName || `item_${aegisName}`
}

// ─── Processar um único item ──────────────────────────────────────────────────

async function processItem(
  rathenaEntry: RAthenaItem,
  report: {
    inserted: number; skipped: number
    with_bonus: number; total_bonuses: number; errors: string[]
  }
) {
  const { id, script: rathenaScript, rathenaName, aegisName } = rathenaEntry

  try {
    const dpItem = await fetchItem(id)
    if (!dpItem) { report.skipped++; return }

    // ── Nome com fallback em cascata ─────────────────────────────────────────
    const name = resolveName(dpItem.name, dpItem.unidName, rathenaName, aegisName)

    // ── Script: prefere Divine Pride, fallback rAthena ───────────────────────
    const dpScript = getBonusScript(dpItem)
    const script   = dpScript || rathenaScript || ''
    const bonuses  = parseBonusScript(script)

    if (DRY_RUN) {
      const src     = dpScript ? 'DP' : (rathenaScript ? 'RA' : '--')
      const preview = bonuses.length > 0
        ? bonuses.slice(0, 3).map(b => `${b.stat}:${b.value > 0 ? '+' : ''}${b.value}`).join(' ')
        : '(sem bônus)'
      console.log(
        `  #${String(id).padStart(6)} ${name.slice(0, 36).padEnd(36)}` +
        ` [${src}] → ${preview}${bonuses.length > 3 ? ` +${bonuses.length - 3}` : ''}`
      )
      report.inserted++
      return
    }

    // ── Upsert item ──────────────────────────────────────────────────────────
    const { error: upsertErr } = await supabase.from('items').upsert({
      id:          String(id),
      name,
      type:        dpItem.itemTypeId,
      sub_type:    dpItem.itemSubTypeId ?? null,
      slots:       dpItem.slots ?? 0,
      weight:      dpItem.weight ?? null,
      description: dpItem.description ?? null,
      raw_bonus:   script || null,
      dp_data:     dpItem as unknown as Record<string, unknown>,
      source:      'divine_pride',
    }, { onConflict: 'id' })

    if (upsertErr) {
      report.errors.push(`#${id} (${name}): ${upsertErr.message}`)
      return
    }

    // ── Reconstrói item_bonuses ──────────────────────────────────────────────
    if (bonuses.length > 0) {
      await supabase.from('item_bonuses').delete().eq('item_id', String(id))

      const { error: bonusErr } = await supabase.from('item_bonuses').insert(
        bonuses.map(b => ({
          item_id:   String(id),
          stat:      b.stat,
          value:     b.value,
          condition: b.condition ?? 'always',
          job_id:    b.job_id    ?? null,
          skill_mod: b.skill_mod ?? null,
          is_card:   dpItem.itemTypeId === DP_ITEM_TYPES.CARD,
        }))
      )

      if (!bonusErr) {
        report.with_bonus++
        report.total_bonuses += bonuses.length
      } else {
        report.errors.push(`#${id} bonuses: ${bonusErr.message}`)
      }
    }

    report.inserted++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('404') && !msg.includes('não encontrado')) {
      report.errors.push(`#${id}: ${msg}`)
    }
    report.skipped++
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  ingest-all.ts  (rAthena equip+etc → Divine Pride)')
  console.log(`   Tipos   : ${TYPES.map(t => `${t} (${TYPE_NAMES[t] ?? '?'})`).join(', ')}`)
  console.log(`   Modo    : ${DRY_RUN ? 'DRY RUN' : 'PRODUÇÃO'}`)
  if (LIMIT !== Infinity) console.log(`   Limite  : ${LIMIT} itens/tipo`)
  if (RESET && !DRY_RUN)  console.log('   Reset   : ✔ (item_bonuses será limpo)')
  console.log('')

  if (RESET && !DRY_RUN) {
    console.log('🗑️  Limpando item_bonuses...')
    await supabase.from('item_bonuses').delete().neq('id', 0)
    console.log('   ✔ Limpo.\n')
  }

  // ── Baixa ambos os YAMLs de uma vez ─────────────────────────────────────────
  console.log('⬇️   Baixando item_db_equip.yml + item_db_etc.yml do rAthena...')
  const allRAthenaItems = await fetchRAthenaEquipIds()
  const equip = allRAthenaItems.filter(i => i.typeId !== 6)
  const cards = allRAthenaItems.filter(i => i.typeId === 6)
  console.log(`   ✔ ${fmt(equip.length)} equipamentos  |  ${fmt(cards.length)} cards carregados.\n`)

  const globalReport = {
    inserted: 0, skipped: 0,
    with_bonus: 0, total_bonuses: 0,
    errors: [] as string[],
  }

  for (const type of TYPES) {
    const typeName = TYPE_NAMES[type] ?? String(type)
    console.log(`\n📦  Tipo ${type} — ${typeName}`)

    let list = filterByType(allRAthenaItems, [type])
    if (LIMIT !== Infinity) list = list.slice(0, LIMIT)

    if (list.length === 0) {
      console.log(`   ⚠️  Nenhum item deste tipo encontrado no rAthena.`)
      continue
    }

    console.log(`   ✔ ${fmt(list.length)} IDs encontrados. Buscando detalhes na Divine Pride...\n`)

    const typeReport = {
      inserted: 0, skipped: 0,
      with_bonus: 0, total_bonuses: 0,
      errors: [] as string[],
    }

    for (const [i, entry] of list.entries()) {
      process.stdout.write(
        `\r   ${bar(i + 1, list.length)} #${entry.id} ${entry.aegisName.slice(0, 20).padEnd(20)}`
      )
      await processItem(entry, typeReport)
      await new Promise(r => setTimeout(r, 1050))
    }

    console.log(
      `\n\n   ✅ ${typeName}: ` +
      `${fmt(typeReport.inserted)} salvos | ` +
      `${fmt(typeReport.with_bonus)} com bônus | ` +
      `${fmt(typeReport.total_bonuses)} bônus totais | ` +
      `${typeReport.errors.length} erros`
    )

    globalReport.inserted      += typeReport.inserted
    globalReport.with_bonus    += typeReport.with_bonus
    globalReport.total_bonuses += typeReport.total_bonuses
    globalReport.skipped       += typeReport.skipped
    globalReport.errors.push(...typeReport.errors)
  }

  console.log('\n\n' + '─'.repeat(55))
  console.log('📊  RELATÓRIO FINAL')
  console.log('─'.repeat(55))
  console.log(`  Itens salvos         : ${fmt(globalReport.inserted)}`)
  console.log(`  Com bônus            : ${fmt(globalReport.with_bonus)}`)
  console.log(`  Total de bônus       : ${fmt(globalReport.total_bonuses)}`)
  console.log(`  Ignorados (404/erro) : ${fmt(globalReport.skipped)}`)
  console.log(`  Erros graves         : ${globalReport.errors.length}`)

  if (globalReport.errors.length > 0) {
    console.log('\n⚠️  Primeiros erros:')
    globalReport.errors.slice(0, 10).forEach(e => console.log('   ', e))
  }

  if (DRY_RUN) {
    console.log('\n💡  Dry run. Rode sem --dry-run para gravar no banco.')
  } else {
    console.log('\n✅  Banco populado!')
    console.log('   Próximo passo:')
    console.log('   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/parse-bonuses.ts')
  }
  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

/**
 * scripts/ingest-all.ts
 *
 * Ingere itens da Divine Pride API diretamente no Supabase,
 * sem precisar de servidor HTTP rodando localmente.
 *
 * Busca item a item via /item/{id} (rota que retorna itemScript completo)
 * e popula items + item_bonuses em sequência.
 *
 * Uso:
 *   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/ingest-all.ts
 *
 * Flags:
 *   --types=4,5,6,18,10   Tipos a ingerir (default: 4,5,6,18)
 *   --dry-run              Mostra sem gravar
 *   --reset                Limpa item_bonuses antes de começar
 */

import { createClient } from '@supabase/supabase-js'
import { fetchItem, fetchItemsByType, getBonusScript, DP_ITEM_TYPES, type DPItemType } from '../lib/divine-pride'
import { parseBonusScript } from '../lib/bonus-parser'

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
  const pct   = total > 0 ? current / total : 0
  const filled = Math.round(pct * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' +
    String(Math.round(pct * 100)).padStart(3) + '% ' +
    `(${fmt(current)}/${fmt(total)})`
}

// ─── Processar um único item ───────────────────────────────────────────────────

async function processItem(id: number, report: {
  inserted: number; updated: number; skipped: number
  with_bonus: number; total_bonuses: number; errors: string[]
}) {
  try {
    const dpItem = await fetchItem(id)
    if (!dpItem) { report.skipped++; return }

    const script  = getBonusScript(dpItem)
    const bonuses = parseBonusScript(script)

    if (DRY_RUN) {
      if (bonuses.length > 0) {
        const preview = bonuses.slice(0, 3).map(b => `${b.stat}:${b.value > 0 ? '+' : ''}${b.value}`).join(' ')
        console.log(`  #${id} ${dpItem.name.slice(0, 40).padEnd(40)} → ${preview}${bonuses.length > 3 ? ' ...' : ''}`)
      }
      report.inserted++
      return
    }

    // Upsert item
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
    }, { onConflict: 'id' })

    if (upsertErr) {
      report.errors.push(`#${id}: ${upsertErr.message}`)
      return
    }

    // Reconstrói item_bonuses
    if (bonuses.length > 0) {
      await supabase.from('item_bonuses').delete().eq('item_id', String(id))
      const { error: bonusErr } = await supabase.from('item_bonuses').insert(
        bonuses.map(b => ({
          item_id:   String(id),
          stat:      b.stat,
          value:     b.value,
          condition: b.condition ?? 'always',
          job_id:    b.job_id ?? null,
          skill_mod: b.skill_mod ?? null,
          is_card:   dpItem.itemTypeId === DP_ITEM_TYPES.CARD,
        }))
      )
      if (!bonusErr) {
        report.with_bonus++
        report.total_bonuses += bonuses.length
      }
    }

    report.inserted++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Ignora 404s silenciosamente, loga o resto
    if (!msg.includes('404') && !msg.includes('não encontrado')) {
      report.errors.push(`#${id}: ${msg}`)
    }
    report.skipped++
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  ingest-all.ts')
  console.log(`   Tipos   : ${TYPES.map(t => `${t} (${TYPE_NAMES[t] ?? '?'})`).join(', ')}`)
  console.log(`   Modo    : ${DRY_RUN ? 'DRY RUN' : 'PRODUÇÃO'}`)
  if (RESET && !DRY_RUN) console.log('   Reset   : ✔ (item_bonuses será limpo)')
  console.log('')

  // Reset opcional
  if (RESET && !DRY_RUN) {
    console.log('🗑️  Limpando item_bonuses...')
    await supabase.from('item_bonuses').delete().neq('id', 0)
    console.log('   ✔ Limpo.\n')
  }

  const globalReport = { inserted: 0, updated: 0, skipped: 0, with_bonus: 0, total_bonuses: 0, errors: [] as string[] }

  for (const type of TYPES) {
    const typeName = TYPE_NAMES[type] ?? String(type)
    console.log(`\n📦  Tipo ${type} — ${typeName}`)
    console.log('   Listando IDs na Divine Pride...')

    const list = await fetchItemsByType(type as DPItemType, {
      onPage: (items, page) => process.stdout.write(`\r   Página ${page}: ${items.length} itens encontrados...`),
    })

    console.log(`\r   ✔ ${fmt(list.length)} IDs encontrados. Buscando detalhes...\n`)

    const typeReport = { inserted: 0, updated: 0, skipped: 0, with_bonus: 0, total_bonuses: 0, errors: [] as string[] }

    for (const [i, entry] of list.entries()) {
      process.stdout.write(`\r   ${bar(i + 1, list.length)} #${entry.id} ${entry.name.slice(0, 20).padEnd(20)}`)
      await processItem(entry.id, typeReport)
      // Rate limit: 1 req/s
      await new Promise(r => setTimeout(r, 1050))
    }

    console.log(`\n\n   ✅ ${typeName}: ${fmt(typeReport.inserted)} salvos | ${fmt(typeReport.with_bonus)} com bônus | ${fmt(typeReport.total_bonuses)} bônus totais | ${typeReport.errors.length} erros`)

    // Acumula no global
    globalReport.inserted     += typeReport.inserted
    globalReport.with_bonus   += typeReport.with_bonus
    globalReport.total_bonuses += typeReport.total_bonuses
    globalReport.skipped      += typeReport.skipped
    globalReport.errors.push(...typeReport.errors)
  }

  // ─── Relatório final ───────────────────────────────────────────────────────
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
    globalReport.errors.slice(0, 10).forEach(e => console.log('  ', e))
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

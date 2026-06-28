/**
 * scripts/parse-bonuses.ts
 *
 * Lê todos os itens que já têm raw_bonus no banco (sem chamar a Divine Pride)
 * e popula a tabela item_bonuses com os bônus parseados.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/parse-bonuses.ts
 *
 * Flags opcionais (via env ou args):
 *   --dry-run          Mostra o resultado sem gravar no banco
 *   --batch=100        Tamanho do batch de leitura (default: 100)
 *   --stat=str         Filtra e exibe apenas itens com esse stat
 *   --reset            Apaga TODOS os item_bonuses antes de começar
 */

import { createClient } from '@supabase/supabase-js'
import { parseBonusScript, summarizeBonuses } from '../lib/bonus-parser'

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente (.env ou shell)')
  process.exit(1)
}

const args       = process.argv.slice(2)
const DRY_RUN    = args.includes('--dry-run')
const RESET      = args.includes('--reset')
const BATCH_ARG  = args.find(a => a.startsWith('--batch='))
const STAT_ARG   = args.find(a => a.startsWith('--stat='))
const BATCH_SIZE = BATCH_ARG ? parseInt(BATCH_ARG.split('=')[1], 10) : 100
const STAT_FILTER = STAT_ARG ? STAT_ARG.split('=')[1].toLowerCase() : null

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number) {
  return n.toLocaleString('pt-BR')
}

function progress(current: number, total: number) {
  const pct   = Math.round((current / total) * 100)
  const bar   = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5))
  process.stdout.write(`\r  [${bar}] ${pct}% (${fmtNumber(current)}/${fmtNumber(total)})`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧  parse-bonuses.ts')
  console.log(`   Modo    : ${DRY_RUN ? 'DRY RUN (não grava nada)' : 'PRODUÇÃO'}`)
  console.log(`   Batch   : ${BATCH_SIZE} itens/página`)
  if (STAT_FILTER) console.log(`   Filtro  : stat = "${STAT_FILTER}"`)
  if (RESET && !DRY_RUN) console.log(`   Reset   : ✔ (item_bonuses será limpo antes)`)
  console.log('')

  // 1. Conta total de itens com raw_bonus
  const { count, error: countErr } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .not('raw_bonus', 'is', null)
    .neq('raw_bonus', '')

  if (countErr) {
    console.error('❌  Erro ao contar itens:', countErr.message)
    process.exit(1)
  }

  const total = count ?? 0
  console.log(`📦  Itens com raw_bonus: ${fmtNumber(total)}`)

  if (total === 0) {
    console.log('\n⚠️  Nenhum item com raw_bonus encontrado.')
    console.log('   Execute primeiro: POST /api/ingest/divine-pride com { "type": 4 } (armas), { "type": 5 } (armaduras), etc.')
    process.exit(0)
  }

  // 2. Reset opcional
  if (RESET && !DRY_RUN) {
    console.log('\n🗑️  Limpando item_bonuses...')
    const { error: delErr } = await supabase
      .from('item_bonuses')
      .delete()
      .neq('id', 0)  // deleta tudo
    if (delErr) {
      console.error('❌  Erro ao limpar:', delErr.message)
      process.exit(1)
    }
    console.log('   ✔ Tabela limpa.')
  }

  // 3. Processa em batches
  const report = {
    processed: 0,
    with_bonuses: 0,
    total_bonuses: 0,
    skipped_no_script: 0,
    skipped_only_complex: 0,
    errors: [] as string[],
    stat_summary: {} as Record<string, number>,  // stat → total de itens que têm esse stat
  }

  let page = 0

  console.log('\n🚀  Processando...')

  while (true) {
    const from = page * BATCH_SIZE
    const to   = from + BATCH_SIZE - 1

    const { data: items, error: fetchErr } = await supabase
      .from('items')
      .select('id, name, raw_bonus, type')
      .not('raw_bonus', 'is', null)
      .neq('raw_bonus', '')
      .range(from, to)
      .order('id')

    if (fetchErr) {
      console.error(`\n❌  Erro na página ${page}:`, fetchErr.message)
      break
    }

    if (!items || items.length === 0) break

    for (const item of items) {
      report.processed++
      progress(report.processed, total)

      try {
        const bonuses = parseBonusScript(item.raw_bonus ?? '')

        if (bonuses.length === 0) {
          report.skipped_no_script++
          continue
        }

        const realBonuses = bonuses.filter(b => b.stat !== 'complex')
        if (realBonuses.length === 0) {
          report.skipped_only_complex++
          continue
        }

        // Atualiza stat_summary
        const summary = summarizeBonuses(realBonuses)
        for (const stat of Object.keys(summary)) {
          report.stat_summary[stat] = (report.stat_summary[stat] ?? 0) + 1
        }

        // Filtra por --stat se passado
        const toInsert = STAT_FILTER
          ? realBonuses.filter(b => b.stat === STAT_FILTER)
          : realBonuses

        if (toInsert.length === 0) continue

        report.with_bonuses++
        report.total_bonuses += toInsert.length

        if (DRY_RUN) {
          // Mostra preview
          const preview = summarizeBonuses(toInsert)
          const previewStr = Object.entries(preview)
            .map(([s, v]) => `${s}:${v > 0 ? '+' : ''}${v}`)
            .join(' | ')
          process.stdout.write(`\n  #${item.id} ${item.name.padEnd(40)} ${previewStr}`)
          continue
        }

        // Grava no banco: deleta os antigos e insere os novos
        await supabase.from('item_bonuses').delete().eq('item_id', item.id)
        const { error: insertErr } = await supabase.from('item_bonuses').insert(
          toInsert.map(b => ({
            item_id:   item.id,
            stat:      b.stat,
            value:     b.value,
            condition: b.condition,
            job_id:    b.job_id ?? null,
            skill_mod: b.skill_mod ?? null,
            is_card:   item.type === 6,  // type 6 = card na Divine Pride
          }))
        )

        if (insertErr) {
          report.errors.push(`#${item.id}: ${insertErr.message}`)
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        report.errors.push(`#${item.id}: ${msg}`)
      }
    }

    page++
    if (items.length < BATCH_SIZE) break
  }

  // 4. Relatório final
  console.log('\n\n' + '─'.repeat(55))
  console.log('📊  RELATÓRIO FINAL')
  console.log('─'.repeat(55))
  console.log(`  Itens processados    : ${fmtNumber(report.processed)}`)
  console.log(`  Com bônus válidos    : ${fmtNumber(report.with_bonuses)}`)
  console.log(`  Total de bônus       : ${fmtNumber(report.total_bonuses)}`)
  console.log(`  Sem script           : ${fmtNumber(report.skipped_no_script)}`)
  console.log(`  Somente "complex"    : ${fmtNumber(report.skipped_only_complex)}`)
  console.log(`  Erros               : ${report.errors.length}`)

  if (report.errors.length > 0) {
    console.log('\n⚠️  Primeiros erros:')
    report.errors.slice(0, 10).forEach(e => console.log('  ', e))
  }

  // Top 15 stats mais comuns
  const topStats = Object.entries(report.stat_summary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  if (topStats.length > 0) {
    console.log('\n🏆  Stats mais encontrados (top 15):')
    topStats.forEach(([stat, count], i) => {
      const bar = '▪'.repeat(Math.min(30, Math.round((count / (topStats[0][1] || 1)) * 30)))
      console.log(`  ${String(i + 1).padStart(2)}. ${stat.padEnd(18)} ${bar} ${fmtNumber(count)} itens`)
    })
  }

  if (DRY_RUN) {
    console.log('\n💡  Dry run concluído. Para gravar, rode sem --dry-run.')
  } else {
    console.log(`\n✅  item_bonuses populado com sucesso!`)
    console.log(`   Próximo passo: POST /api/embed para gerar embeddings dos itens com bônus.`)
  }

  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

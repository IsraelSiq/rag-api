/**
 * scripts/fetch-scripts.ts
 *
 * Busca o itemScript/equipScript individual de todos os itens que têm
 * hasScript=true no dp_data mas ainda não têm raw_bonus preenchido.
 * Também atualiza o dp_data completo (que veio incompleto da listagem).
 *
 * Por que isso é necessário?
 *   A rota de listagem da Divine Pride (/item?type=X) NÃO retorna o campo
 *   itemScript. Ele só está disponível na rota individual (/item/{id}).
 *   Itens inseridos via listagem ficam com raw_bonus=null mesmo tendo script.
 *
 * Uso:
 *   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/fetch-scripts.ts
 *
 * Flags opcionais:
 *   --dry-run     Mostra o que seria atualizado sem gravar no banco
 *   --all         Reprocessa TODOS (incluindo quem já tem raw_bonus)
 *   --limit=50    Processa apenas os primeiros N itens (útil para testar)
 */

import { createClient } from '@supabase/supabase-js'
import { fetchItem, getBonusScript } from '../lib/divine-pride'

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  process.exit(1)
}

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ALL     = args.includes('--all')
const LIMIT_ARG = args.find(a => a.startsWith('--limit='))
const LIMIT   = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  fetch-scripts.ts')
  console.log(`   Modo    : ${DRY_RUN ? 'DRY RUN (não grava nada)' : 'PRODUÇÃO'}`)
  console.log(`   Escopo  : ${ALL ? 'TODOS os itens com hasScript' : 'Apenas sem raw_bonus'}`)
  if (LIMIT) console.log(`   Limite  : ${LIMIT} itens`)
  console.log('')

  // 1. Busca IDs a processar
  let query = supabase
    .from('items')
    .select('id, name')
    .filter('dp_data->>hasScript', 'eq', 'true')
    .order('id')

  if (!ALL) {
    query = query.is('raw_bonus', null)
  }

  if (LIMIT) {
    query = query.limit(LIMIT)
  }

  const { data: items, error } = await query

  if (error) {
    console.error('❌  Erro ao buscar itens:', error.message)
    process.exit(1)
  }

  if (!items || items.length === 0) {
    console.log('✅  Nenhum item pendente! Todos os raw_bonus já estão preenchidos.')
    console.log('   Use --all para forçar o reprocessamento de todos.')
    return
  }

  const total = items.length
  const estimatedMin = Math.ceil(total / 60)
  console.log(`🎯  ${total} itens para buscar scripts (~${estimatedMin} min)\n`)

  const report = { ok: 0, empty_script: 0, fail: 0, errors: [] as string[] }

  for (const [i, item] of items.entries()) {
    const prefix = `[${String(i + 1).padStart(4)}/${total}]`
    const label  = `#${item.id} ${(item.name as string).slice(0, 35).padEnd(35)}`
    process.stdout.write(`\r${prefix} ${label}`)

    try {
      const dpItem = await fetchItem(Number(item.id))

      if (!dpItem) {
        report.errors.push(`#${item.id}: não encontrado na API`)
        report.fail++
        continue
      }

      const script = getBonusScript(dpItem)

      if (DRY_RUN) {
        if (script) {
          process.stdout.write(`\r${prefix} ${label} → ${script.slice(0, 60)}\n`)
        }
        report.ok++
        continue
      }

      // Atualiza raw_bonus E dp_data completo (substitui o dado incompleto da listagem)
      const { error: updateErr } = await supabase
        .from('items')
        .update({
          raw_bonus: script || null,
          dp_data:   dpItem as unknown as Record<string, unknown>,
        })
        .eq('id', String(item.id))

      if (updateErr) {
        report.errors.push(`#${item.id}: ${updateErr.message}`)
        report.fail++
      } else {
        if (script) report.ok++
        else report.empty_script++
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      report.errors.push(`#${item.id}: ${msg}`)
      report.fail++
    }

    // Rate limit respeitoso: 1 req/s
    await new Promise(r => setTimeout(r, 1050))
  }

  // ─── Relatório ──────────────────────────────────────────────────────────────
  console.log('\n\n' + '─'.repeat(55))
  console.log('📊  RELATÓRIO')
  console.log('─'.repeat(55))
  console.log(`  Com script salvo     : ${report.ok}`)
  console.log(`  Sem script (vazio)   : ${report.empty_script}`)
  console.log(`  Erros                : ${report.fail}`)

  if (report.errors.length > 0) {
    console.log('\n⚠️  Primeiros erros:')
    report.errors.slice(0, 10).forEach(e => console.log('  ', e))
  }

  if (DRY_RUN) {
    console.log('\n💡  Dry run. Rode sem --dry-run para gravar.')
  } else {
    console.log('\n✅  Concluído!')
    console.log('   Próximo passo:')
    console.log('   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/parse-bonuses.ts --dry-run')
  }

  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

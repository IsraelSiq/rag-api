/**
 * seed-divine-pride.ts
 * Full extract de itens do Divine Pride API → tabela `items` no Supabase.
 *
 * Varre IDs em paralelo, salva tudo que retornar da API.
 * Itens não encontrados (404) são silenciosamente ignorados.
 *
 * Uso:
 *   npx tsx scripts/seed-divine-pride.ts                  # varre 1 ~ 32000
 *   npx tsx scripts/seed-divine-pride.ts --from 1 --to 5000
 *   npx tsx scripts/seed-divine-pride.ts --from 5001 --to 10000
 *
 * Variáveis de ambiente (.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   DIVINE_PRIDE_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────────

const DP_BASE   = 'https://www.divine-pride.net/api/database'
const DP_SERVER = 'bRO'
const ID_FROM   = 1
const ID_TO     = 32000
const CONCURRENCY = 10   // requisições paralelas
const DELAY_MS    = 150  // delay entre batches (ms)
const UPSERT_CHUNK = 100 // linhas por upsert

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

// ─── Fetch single item ────────────────────────────────────────────────────────

async function fetchItem(id: number): Promise<any | null> {
  const url = `${DP_BASE}/Item/${id}?apiKey=${process.env.DIVINE_PRIDE_API_KEY}&server=${DP_SERVER}`
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      // Rate limit ou erro temporário — aguarda e tenta de novo
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000)
        return fetchItem(id)
      }
      return null
    }
    const json = await res.json() as any
    return mapItem(json)
  } catch {
    return null
  }
}

// ─── Map DP response → schema da tabela items ──────────────────────────────────

function mapItem(j: any) {
  return {
    id:         String(j.id),
    name:       j.name ?? j.unidName ?? '',
    is_costume: false,
    type:       j.typeId      ?? null,
    sub_type:   j.subTypeId   ?? null,
    weight:     j.weight      ?? null,
    slots:      j.slots       ?? 0,
    dp_data:    j,
  }
}

// ─── Upsert batch ──────────────────────────────────────────────────────────────

async function upsertBatch(rows: any[]) {
  if (rows.length === 0) return
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    const { error } = await supabase
      .from('items')
      .upsert(chunk, { onConflict: 'id' })
    if (error) log(`  ❌ Erro upsert: ${error.message}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios')
    process.exit(1)
  }
  if (!process.env.DIVINE_PRIDE_API_KEY) {
    log('❌ DIVINE_PRIDE_API_KEY é obrigatório')
    process.exit(1)
  }

  // Parse args --from / --to
  const args = process.argv.slice(2)
  const fromIdx = args.indexOf('--from')
  const toIdx   = args.indexOf('--to')
  const from = fromIdx !== -1 ? parseInt(args[fromIdx + 1]) : ID_FROM
  const to   = toIdx   !== -1 ? parseInt(args[toIdx   + 1]) : ID_TO

  const total = to - from + 1
  log(`🚀 Extraindo itens do Divine Pride: ID ${from} → ${to} (${total} IDs)`)
  log(`   Concorrência: ${CONCURRENCY} | Delay: ${DELAY_MS}ms | Est. ${Math.ceil(total / CONCURRENCY * DELAY_MS / 1000 / 60)} min`)

  let found    = 0
  let notFound = 0
  let buffer:  any[] = []

  for (let id = from; id <= to; id += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, to - id + 1) },
      (_, i) => fetchItem(id + i)
    )
    const results = await Promise.all(batch)

    for (const item of results) {
      if (item) { buffer.push(item); found++ }
      else notFound++
    }

    // Faz upsert a cada 500 itens encontrados
    if (buffer.length >= 500) {
      await upsertBatch(buffer)
      buffer = []
    }

    const done = id - from + CONCURRENCY
    process.stdout.write(
      `  [${Math.min(done, total)}/${total}] encontrados: ${found} | não encontrados: ${notFound}\r`
    )

    await sleep(DELAY_MS)
  }

  // Flush restante
  if (buffer.length > 0) await upsertBatch(buffer)

  log(`\n✅ Concluído! ${found} itens salvos, ${notFound} IDs vazios`)
  log(`🎉 Seed Divine Pride completo!`)
}

main().catch(err => {
  log(`❌ Erro fatal: ${err}`)
  process.exit(1)
})

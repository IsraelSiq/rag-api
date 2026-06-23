/**
 * seed-divine-pride.ts
 * Full extract de itens do Divine Pride API → tabela `items` no Supabase.
 *
 * Varre IDs em paralelo, salva tudo que retornar da API.
 * Itens não encontrados (404) são silenciosamente ignorados.
 * A coluna `translated` indica se o nome/descrição estão em texto legível (sem coreano/chinês).
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

const DP_BASE      = 'https://www.divine-pride.net/api/database'
const DP_SERVER    = 'bRO'
const ID_FROM      = 1
const ID_TO        = 32000
const CONCURRENCY  = 10
const DELAY_MS     = 150
const UPSERT_CHUNK = 100

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

// ─── Detecta se o texto é legível (sem CJK) ───────────────────────────────────

// Blocos CJK: chinês, japonês, coreano
const CJK_REGEX = /[\u1100-\u11FF\u2E80-\u2FFF\u3000-\u9FFF\uA000-\uA4FF\uAC00-\uD7FF\uF900-\uFAFF]/

function isReadable(text: string | null | undefined): boolean {
  if (!text || text.trim().length === 0) return false
  const cjkCount = (text.match(new RegExp(CJK_REGEX.source, 'g')) ?? []).length
  // Rejeita se mais de 15% dos caracteres forem CJK
  return cjkCount / text.length < 0.15
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
  const name        = j.name ?? j.unidName ?? ''
  const description = j.description ?? ''

  // translated = true se nome E descrição forem legíveis
  // (descrição vazia é aceitável — muitos consumibles não têm)
  const translated = isReadable(name) && (description === '' || isReadable(description))

  return {
    id:          String(j.id),
    name,
    is_costume:  false,
    type:        j.typeId    ?? null,
    sub_type:    j.subTypeId ?? null,
    weight:      j.weight    ?? null,
    slots:       j.slots     ?? 0,
    translated,
    dp_data:     j,
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

  const args    = process.argv.slice(2)
  const fromIdx = args.indexOf('--from')
  const toIdx   = args.indexOf('--to')
  const from    = fromIdx !== -1 ? parseInt(args[fromIdx + 1]) : ID_FROM
  const to      = toIdx   !== -1 ? parseInt(args[toIdx   + 1]) : ID_TO

  const total = to - from + 1
  log(`🚀 Extraindo itens do Divine Pride: ID ${from} → ${to} (${total} IDs)`)
  log(`   Concorrência: ${CONCURRENCY} | Delay: ${DELAY_MS}ms | Est. ~${Math.ceil(total / CONCURRENCY * DELAY_MS / 1000 / 60)} min`)

  let found      = 0
  let translated = 0
  let notFound   = 0
  let buffer: any[] = []

  for (let id = from; id <= to; id += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, to - id + 1) },
      (_, i) => fetchItem(id + i)
    )
    const results = await Promise.all(batch)

    for (const item of results) {
      if (item) {
        buffer.push(item)
        found++
        if (item.translated) translated++
      } else {
        notFound++
      }
    }

    if (buffer.length >= 500) {
      await upsertBatch(buffer)
      buffer = []
    }

    const done = Math.min(id - from + CONCURRENCY, total)
    process.stdout.write(
      `  [${done}/${total}] salvos: ${found} (✅ traduzidos: ${translated} | 🌐 sem tradução: ${found - translated}) | vazios: ${notFound}\r`
    )

    await sleep(DELAY_MS)
  }

  if (buffer.length > 0) await upsertBatch(buffer)

  log(`\n✅ Concluído!`)
  log(`   Total salvo:      ${found}`)
  log(`   Traduzidos:       ${translated}`)
  log(`   Sem tradução:    ${found - translated}`)
  log(`   IDs vazios (404): ${notFound}`)
  log(`🎉 Seed Divine Pride completo!`)
}

main().catch(err => {
  log(`❌ Erro fatal: ${err}`)
  process.exit(1)
})

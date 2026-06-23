/**
 * seed-market.ts
 * Popula as tabelas vending_shops, vending_items e items no Supabase.
 *
 * Fluxo:
 *   1. Busca todas as lojas abertas no Hero Saga (requer cookie de sessão)
 *   2. Busca os itens de cada loja via HTML scraping
 *   3. Salva lojas e itens no Supabase
 *   4. Enriquece a tabela `items` consultando a API do Divine Pride
 *      para cada item_id único encontrado nas lojas
 *
 * Uso:
 *   npx tsx scripts/seed-market.ts            # tudo
 *   npx tsx scripts/seed-market.ts --shops    # lojas + itens das lojas
 *   npx tsx scripts/seed-market.ts --enrich   # só enriquece itens via Divine Pride
 *
 * Variáveis de ambiente (.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   HEROSAGA_COOKIE          (ex: fluxSessionData=abc123)
 *   DIVINE_PRIDE_API_KEY
 */

import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE        = 'https://rpgherosaga.com'
const DP_BASE     = 'https://www.divine-pride.net/api/database'
const DP_SERVER   = 'bRO'
const DELAY_MS    = 300
const SHOP_CONCURRENCY = 5
const DP_CONCURRENCY   = 5   // requisições paralelas ao Divine Pride

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

function detectCurrency(title: string): 'zeny' | 'hero_points' | 'rmt' {
  const t = (title || '').toUpperCase()
  if (t.includes('[HERO POINTS]') || t.includes('[ROPS]')) return 'hero_points'
  if (t.includes('[MOEDA RMT]')   || t.includes('[RMT]'))  return 'rmt'
  return 'zeny'
}

// ─── Headers Hero Saga ────────────────────────────────────────────────────────

function getHeaders(accept = 'application/json') {
  return {
    'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With':  'XMLHttpRequest',
    'Accept':            accept,
    'Cookie':            process.env.HEROSAGA_COOKIE ?? '',
  }
}

// ─── STEP 1: Lojas abertas ────────────────────────────────────────────────────

async function fetchAllShops() {
  log('🏪 Buscando lojas abertas...')
  const shops: any[] = []
  let page = 1
  let totalPages = 1

  do {
    try {
      const res  = await fetch(
        `${BASE}/?module=vending&action=filter&page=${page}&sort=id&order=asc`,
        { headers: getHeaders() }
      )
      const json = await res.json() as { vendings?: any[]; pagination?: any }
      totalPages = json.pagination?.totalPages ?? 1

      for (const v of json.vendings ?? []) {
        shops.push({
          id:        String(v.id),
          title:     v.title,
          char_name: v.char_name,
          map:       v.map,
          x:         v.x,
          y:         v.y,
          autotrade: v.autotrade,
          currency:  detectCurrency(v.title),
          synced_at: new Date().toISOString(),
        })
      }
      process.stdout.write(`  página ${page}/${totalPages} → ${shops.length} lojas\r`)
    } catch (e) {
      log(`  ⚠️  Erro na página ${page}: ${e}`)
    }
    page++
    await sleep(DELAY_MS)
  } while (page <= totalPages)

  log(`\n✅ ${shops.length} lojas encontradas`)
  return shops
}

// ─── STEP 2: Itens de uma loja ────────────────────────────────────────────────

async function fetchShopItems(shopId: string) {
  try {
    const res = await fetch(
      `${BASE}/?module=vending&action=viewshop&id=${shopId}`,
      { headers: getHeaders('text/html') }
    )
    const $     = cheerio.load(await res.text())
    const items: any[] = []

    $('table tbody tr').each((_, row) => {
      const cols    = $(row).find('td')
      const itemId  = cols.eq(0).text().trim()
      if (!itemId || !/^\d+$/.test(itemId)) return

      const refinRaw = cols.eq(2).text().trim()
      const priceRaw = cols.eq(9).text().trim()
      const slot1    = cols.eq(4).text().trim()
      const slot2    = cols.eq(5).text().trim()
      const slot3    = cols.eq(6).text().trim()
      const slot4    = cols.eq(7).text().trim()
      const randOpts = cols.eq(8).text().trim()

      items.push({
        shop_id:        shopId,
        item_id:        itemId,
        item_name:      cols.eq(1).text().trim(),
        refinement:     refinRaw ? parseInt(refinRaw.replace('+', '')) || 0 : 0,
        slots:          parseInt(cols.eq(3).text()) || 0,
        slot1:          slot1 === 'Nenhum' || !slot1 ? null : slot1,
        slot2:          slot2 === 'Nenhum' || !slot2 ? null : slot2,
        slot3:          slot3 === 'Nenhum' || !slot3 ? null : slot3,
        slot4:          slot4 === 'Nenhum' || !slot4 ? null : slot4,
        random_options: randOpts === 'Nenhum' || !randOpts ? null : randOpts,
        price:          parseInt(priceRaw.replace(/\D/g, '')) || 0,
        qty:            parseInt(cols.eq(10).text().replace(/\D/g, '')) || 0,
        scraped_at:     new Date().toISOString(),
      })
    })
    return items
  } catch (e) {
    log(`  ⚠️  Erro na loja ${shopId}: ${e}`)
    return []
  }
}

// ─── STEP 3: Enriquece itens via Divine Pride ─────────────────────────────────

async function fetchDivinePrideItem(itemId: string) {
  try {
    const url = `${DP_BASE}/Item/${itemId}?apiKey=${process.env.DIVINE_PRIDE_API_KEY}&server=${DP_SERVER}`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return null
    const json = await res.json() as any
    return {
      id:          String(json.id),
      name:        json.name ?? json.unidName ?? '',
      type:        json.typeId ?? null,
      sub_type:    json.subTypeId ?? null,
      weight:      json.weight ?? null,
      slots:       json.slots ?? 0,
      is_costume:  false,
      dp_data:     json,  // guarda o JSON completo para uso futuro
    }
  } catch {
    return null
  }
}

async function enrichItemsFromDivinePride(itemIds: string[]) {
  log(`📖 Enriquecendo ${itemIds.length} itens via Divine Pride...`)
  const results: any[] = []
  let done = 0
  let notFound = 0

  for (let i = 0; i < itemIds.length; i += DP_CONCURRENCY) {
    const batch = itemIds.slice(i, i + DP_CONCURRENCY)
    const fetched = await Promise.all(batch.map(id => fetchDivinePrideItem(id)))
    for (const item of fetched) {
      if (item) results.push(item)
      else notFound++
    }
    done += batch.length
    process.stdout.write(`  ${done}/${itemIds.length} consultados (${results.length} encontrados, ${notFound} não encontrados)\r`)
    await sleep(DELAY_MS)
  }

  log(`\n✅ ${results.length} itens enriquecidos (${notFound} não encontrados no Divine Pride)`)
  return results
}

// ─── STEP 4: Upsert em lote ───────────────────────────────────────────────────

async function upsertBatch(table: string, rows: any[], conflict: string) {
  if (rows.length === 0) return
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflict })
    if (error) log(`  ❌ Erro upsert ${table}: ${error.message}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env')
    process.exit(1)
  }
  if (!process.env.HEROSAGA_COOKIE) {
    log('❌ HEROSAGA_COOKIE é obrigatório no .env')
    process.exit(1)
  }
  if (!process.env.DIVINE_PRIDE_API_KEY) {
    log('❌ DIVINE_PRIDE_API_KEY é obrigatório no .env')
    process.exit(1)
  }

  const args       = process.argv.slice(2)
  const runAll     = args.length === 0
  const runShops   = runAll || args.includes('--shops')
  const runEnrich  = runAll || args.includes('--enrich')

  let allVendingItems: any[] = []

  // ── Shops ──
  if (runShops) {
    const shops = await fetchAllShops()
    log('💾 Salvando lojas no Supabase...')
    await upsertBatch('vending_shops', shops, 'id')
    log('✅ Lojas salvas!')

    log(`🛒 Buscando itens de ${shops.length} lojas (concorrência: ${SHOP_CONCURRENCY})...`)
    let done = 0

    for (let i = 0; i < shops.length; i += SHOP_CONCURRENCY) {
      const batch   = shops.slice(i, i + SHOP_CONCURRENCY)
      const results = await Promise.all(batch.map(s => fetchShopItems(s.id)))
      for (const items of results) allVendingItems.push(...items)
      done += batch.length
      process.stdout.write(`  ${done}/${shops.length} lojas processadas (${allVendingItems.length} itens)\r`)
      await sleep(DELAY_MS)
    }

    log(`\n💾 Salvando ${allVendingItems.length} itens de lojas no Supabase...`)
    await upsertBatch('vending_items', allVendingItems, 'shop_id,item_id,refinement')
    log('✅ Itens de lojas salvos!')
  }

  // ── Enrich via Divine Pride ──
  if (runEnrich) {
    // Pega item_ids únicos do Supabase (todos que já foram salvos)
    const { data: vendingItems, error } = await supabase
      .from('vending_items')
      .select('item_id')
    if (error) { log(`❌ Erro ao buscar item_ids: ${error.message}`); process.exit(1) }

    const uniqueIds = [...new Set((vendingItems ?? []).map((r: any) => String(r.item_id)))]
    log(`🔎 ${uniqueIds.length} item_ids únicos encontrados nas lojas`)

    const enriched = await enrichItemsFromDivinePride(uniqueIds)
    log('💾 Salvando itens enriquecidos no Supabase...')
    await upsertBatch('items', enriched, 'id')
    log('✅ Itens salvos!')
  }

  log('🎉 Seed completo!')
}

main().catch(err => {
  log(`❌ Erro fatal: ${err}`)
  process.exit(1)
})

/**
 * seed-market.ts
 * Popula as tabelas items, vending_shops e vending_items no Supabase
 * a partir do site rpgherosaga.com
 *
 * Uso:
 *   npx tsx scripts/seed-market.ts
 *
 * Variáveis de ambiente necessárias (.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   HEROSAGA_COOKIE
 */

import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = 'https://rpgherosaga.com'
const DELAY_MS = 400
const SHOP_CONCURRENCY = 5

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function getHeaders(accept: string = 'application/json') {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': accept,
    'Cookie': process.env.HEROSAGA_COOKIE ?? '',
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectCurrency(title: string): 'zeny' | 'hero_points' | 'rmt' {
  const t = (title || '').toUpperCase()
  if (t.includes('[HERO POINTS]') || t.includes('[ROPS]')) return 'hero_points'
  if (t.includes('[MOEDA RMT]') || t.includes('[RMT]'))   return 'rmt'
  return 'zeny'
}

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

// ─── STEP 1: Índice de itens ──────────────────────────────────────────────────

async function fetchItemIndex() {
  log('🔍 Buscando índice de itens...')
  const terms = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
  const seen = new Set<string>()
  const items: { id: string; name: string; is_costume: boolean }[] = []

  for (const term of terms) {
    try {
      const res = await fetch(
        `${BASE}/?module=vending&action=search&item_search=${term}`,
        { headers: getHeaders() }
      )
      const json = await res.json() as { results?: any[] }
      for (const item of json.results ?? []) {
        const id = String(item.id)
        if (!seen.has(id)) {
          seen.add(id)
          items.push({ id, name: item.name, is_costume: !!item.is_costume })
        }
      }
      process.stdout.write(`  termo "${term}" → ${items.length} itens únicos\r`)
    } catch (e) {
      log(`  ⚠️  Erro no termo "${term}": ${e}`)
    }
    await sleep(DELAY_MS)
  }

  log(`\n✅ ${items.length} itens encontrados`)
  return items
}

// ─── STEP 2: Lojas abertas ────────────────────────────────────────────────────

async function fetchAllShops() {
  log('🏪 Buscando lojas abertas...')
  const shops: any[] = []
  let page = 1
  let totalPages = 1

  do {
    try {
      const res = await fetch(
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

// ─── STEP 3: Itens de uma loja ────────────────────────────────────────────────

async function fetchShopItems(shopId: string) {
  try {
    const res = await fetch(
      `${BASE}/?module=vending&action=viewshop&id=${shopId}`,
      { headers: getHeaders('text/html') }
    )
    const $ = cheerio.load(await res.text())
    const items: any[] = []

    $('table tbody tr').each((_, row) => {
      const cols = $(row).find('td')
      const itemId = cols.eq(0).text().trim()
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

  const args = process.argv.slice(2)
  const runAll   = args.length === 0
  const runItems = runAll || args.includes('--items')
  const runShops = runAll || args.includes('--shops')

  // ── Items ──
  if (runItems) {
    const items = await fetchItemIndex()
    log('💾 Salvando itens no Supabase...')
    await upsertBatch('items', items, 'id')
    log('✅ Itens salvos!')
  }

  // ── Shops ──
  if (runShops) {
    const shops = await fetchAllShops()
    log('💾 Salvando lojas no Supabase...')
    await upsertBatch('vending_shops', shops, 'id')
    log('✅ Lojas salvas!')

    log(`🛒 Buscando itens de ${shops.length} lojas (concorrência: ${SHOP_CONCURRENCY})...`)

    let done = 0
    const allVendingItems: any[] = []

    for (let i = 0; i < shops.length; i += SHOP_CONCURRENCY) {
      const batch = shops.slice(i, i + SHOP_CONCURRENCY)
      const results = await Promise.all(batch.map(shop => fetchShopItems(shop.id)))
      for (const items of results) allVendingItems.push(...items)
      done += batch.length
      process.stdout.write(`  ${done}/${shops.length} lojas processadas (${allVendingItems.length} itens)\r`)
      await sleep(DELAY_MS)
    }

    log(`\n💾 Salvando ${allVendingItems.length} itens de lojas no Supabase...`)

    const { data: knownItems } = await supabase.from('items').select('id')
    const knownIds = new Set((knownItems ?? []).map((r: any) => r.id))
    const filtered = allVendingItems.filter(v => knownIds.has(v.item_id))
    const skipped  = allVendingItems.length - filtered.length
    if (skipped > 0) log(`  ⚠️  ${skipped} itens ignorados (item_id não encontrado na tabela items)`)

    await upsertBatch('vending_items', filtered, 'shop_id,item_id,refinement')
    log('✅ Itens de lojas salvos!')
  }

  log('🎉 Seed completo!')
}

main().catch(err => {
  log(`❌ Erro fatal: ${err}`)
  process.exit(1)
})

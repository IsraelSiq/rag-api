/**
 * seed-market.ts
 * Popula as tabelas items, vending_shops e vending_items no Supabase
 * a partir do site rpgherosaga.com
 *
 * Faz login automático via Discord OAuth com Playwright.
 *
 * Uso:
 *   npx tsx scripts/seed-market.ts             # tudo
 *   npx tsx scripts/seed-market.ts --items      # só índice de itens
 *   npx tsx scripts/seed-market.ts --shops      # só lojas + itens das lojas
 *
 * Variáveis de ambiente necessárias (.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   DISCORD_EMAIL       (email da conta Discord)
 *   DISCORD_PASSWORD    (senha da conta Discord)
 */

import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import * as dotenv from 'dotenv'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = 'https://rpgherosaga.com'
const DELAY_MS = 400
const SHOP_CONCURRENCY = 5

const SEARCH_TERMS = [
  ...('abcdefghijklmnopqrstuvwxyz'.split('').map(c => c + c + c)),
  'arm', 'arc', 'arr', 'asa', 'ata', 'ate',
  'bal', 'ban', 'bar', 'bas', 'bat', 'bau', 'bel', 'ber', 'bol', 'bon', 'bot', 'bra', 'bri', 'bro',
  'cai', 'cal', 'cam', 'can', 'cap', 'car', 'cas', 'cav', 'cer', 'cha', 'chi', 'chu', 'cin', 'cir', 'cob', 'col', 'com', 'con', 'cor', 'cos', 'cou', 'cri', 'cro', 'cru',
  'dar', 'dec', 'def', 'del', 'den', 'des', 'dia', 'dra', 'dro',
  'ele', 'enc', 'ene', 'eng', 'enr', 'ens', 'ent', 'env', 'equ', 'esc', 'esp', 'est', 'eve',
  'fad', 'fan', 'far', 'fei', 'fer', 'fla', 'fle', 'flo', 'for', 'fra', 'fri', 'fro', 'fun',
  'gal', 'gem', 'ger', 'gla', 'glo', 'gol', 'gra', 'gri', 'gua', 'gue',
  'hel', 'her', 'hom',
  'ima', 'imp', 'inf', 'ins', 'int', 'inv',
  'jad', 'jav', 'jon',
  'lac', 'lam', 'lan', 'lap', 'lar', 'las', 'len', 'lio', 'lis', 'lit', 'lon',
  'mac', 'mag', 'mal', 'man', 'mar', 'mas', 'med', 'mel', 'mes', 'met', 'moe', 'mol', 'mon', 'mor', 'mun',
  'nac', 'nag', 'niv',
  'ocu', 'old', 'oli', 'ore', 'ori',
  'pac', 'pal', 'pan', 'par', 'pas', 'pat', 'ped', 'pen', 'per', 'pes', 'pie', 'pin', 'pla', 'poc', 'pol', 'por', 'pro',
  'qui',
  'rad', 'ram', 'rap', 'ras', 'rec', 'ref', 'rei', 'rel', 'rem', 'ren', 'res', 'rev', 'rin', 'rob', 'rod', 'ron', 'ros', 'rou', 'rub', 'run',
  'sab', 'sal', 'san', 'sar', 'sec', 'sel', 'sem', 'sen', 'ser', 'sil', 'sim', 'sir', 'sob', 'sol', 'som', 'sor', 'sub', 'sul', 'sup',
  'tab', 'tal', 'tam', 'tar', 'tec', 'tem', 'ten', 'ter', 'tim', 'tis', 'tit', 'tor', 'tot', 'tra', 'tre', 'tri', 'tro', 'tun',
  'ult', 'uni', 'uns',
  'val', 'van', 'var', 'vel', 'ven', 'ver', 'ves', 'via', 'vid', 'vis', 'vit', 'vol', 'vor',
  'war', 'win', 'xan',
  'zap', 'zel', 'zen', 'zon',
  '100', '200', '300', '400', '500',
]

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
  if (t.includes('[MOEDA RMT]') || t.includes('[RMT]'))   return 'rmt'
  return 'zeny'
}

// ─── LOGIN via Playwright ────────────────────────────────────────────────────

async function loginAndGetCookie(): Promise<string> {
  log('🔐 Iniciando login via Discord...')

  const browser = await chromium.launch({ headless: false }) // headless: false para ver o que acontece
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // 1. Acessa o site — será redirecionado para o login
    await page.goto(`${BASE}/?module=vending&action=filter&page=1`, { waitUntil: 'networkidle' })

    // 2. Clica no botão de login com Discord (ajusta o seletor se necessário)
    const loginBtn = page.locator('a[href*="discord"], button:has-text("Discord"), a:has-text("Discord")')
    await loginBtn.first().click()
    await page.waitForURL('**/discord.com/**', { timeout: 10000 })

    // 3. Preenche email e senha do Discord
    await page.waitForSelector('input[name="email"]', { timeout: 10000 })
    await page.fill('input[name="email"]', process.env.DISCORD_EMAIL!)
    await page.fill('input[name="password"]', process.env.DISCORD_PASSWORD!)
    await page.click('button[type="submit"]')

    // 4. Aguarda redirecionamento de volta ao site (OAuth callback)
    // Pode aparecer tela de autorização — clica em Autorizar se aparecer
    try {
      const authorizeBtn = page.locator('button:has-text("Autorizar"), button:has-text("Authorize")')
      await authorizeBtn.waitFor({ timeout: 5000 })
      await authorizeBtn.click()
    } catch {
      // Não apareceu tela de autorização, continua
    }

    // 5. Aguarda estar logado no site
    await page.waitForURL(`${BASE}/**`, { timeout: 30000 })
    await page.waitForLoadState('networkidle')

    // 6. Extrai o cookie de sessão
    const cookies = await context.cookies(BASE)
    const sessionCookie = cookies.find(c => c.name === 'fluxSessionData')

    if (!sessionCookie) {
      // Tira screenshot para debug
      await page.screenshot({ path: 'scripts/login-debug.png' })
      throw new Error('Cookie fluxSessionData não encontrado após login. Screenshot salvo em scripts/login-debug.png')
    }

    const cookieStr = `${sessionCookie.name}=${sessionCookie.value}`
    log(`✅ Login bem-sucedido! Cookie: ${cookieStr.substring(0, 30)}...`)
    return cookieStr

  } finally {
    await browser.close()
  }
}

// ─── Fetch com cookie ─────────────────────────────────────────────────────────

let SESSION_COOKIE = ''

function getHeaders(accept: string = 'application/json') {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': accept,
    'Cookie': SESSION_COOKIE,
  }
}

// ─── STEP 1: Índice de itens ──────────────────────────────────────────────────

async function fetchItemIndex() {
  log('🔍 Buscando índice de itens...')
  const seen = new Set<string>()
  const items: { id: string; name: string; is_costume: boolean }[] = []
  const terms = [...new Set(SEARCH_TERMS)]

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]
    try {
      const res = await fetch(
        `${BASE}/?module=vending&action=search&item_search=${encodeURIComponent(term)}`,
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
      process.stdout.write(`  [${i + 1}/${terms.length}] "${term}" → ${items.length} itens únicos\r`)
    } catch (e) {
      log(`  ⚠️  Erro no termo "${term}": ${e}`)
    }
    await sleep(DELAY_MS)
  }

  log(`\n✅ ${items.length} itens únicos encontrados`)
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
  if (!process.env.DISCORD_EMAIL || !process.env.DISCORD_PASSWORD) {
    log('❌ DISCORD_EMAIL e DISCORD_PASSWORD são obrigatórios no .env')
    process.exit(1)
  }

  // Faz login e obtém cookie de sessão automaticamente
  SESSION_COOKIE = await loginAndGetCookie()

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
    // Sem filtro por knownIds — salva tudo, item_name já vem do HTML da loja
    await upsertBatch('vending_items', allVendingItems, 'shop_id,item_id,refinement')
    log('✅ Itens de lojas salvos!')
  }

  log('🎉 Seed completo!')
}

main().catch(err => {
  log(`❌ Erro fatal: ${err}`)
  process.exit(1)
})

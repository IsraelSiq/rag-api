import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string
);

// Mapa: function ID do Divine Pride -> stat interno do banco
const FUNCTION_TO_STAT: Record<number, string> = {
  // Stats base
  1:   'str',   2:   'agi',   3:  'vit',
  4:   'int',   5:   'dex',   6:  'luk',
  // Combate
  17:  'aspd',  21:  'atk',   22: 'matk',
  10:  'def',   11:  'mdef',  16: 'flee',
  12:  'hit',   14:  'crit',
  // HP/SP
  7:   'hp',    8:   'sp',
  // Dano por tamanho
  812: 'magical_dmg_size',
  // Dano elemental
  55:  'dmg_element',
  // Reducao de cast
  182: 'fixed_cast_reduction',
  183: 'variable_cast_reduction',
};

export interface ScrapedBonus {
  stat:        string;
  value:       number;
  description: string;
  condition:   string;
  function_id: number;
}

export async function scrapeItemBonuses(itemId: string): Promise<ScrapedBonus[]> {
  // 1. Checa cache no dp_item_cache
  const { data: cached } = await supabase
    .from('dp_item_cache')
    .select('data, fetched_at')
    .eq('item_id', itemId)
    .single();

  // Cache valido por 7 dias
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return (cached.data as any).bonuses ?? [];
    }
  }

  // 2. Scraping
  const res = await fetch(`https://www.divine-pride.net/database/item/${itemId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });

  if (!res.ok) throw new Error(`DP scrape failed: ${res.status}`);

  const html = await res.text();
  const $    = cheerio.load(html);
  const bonuses: ScrapedBonus[] = [];

  // 3. Extrai a secao Scripts
  // A legend do item tem classe entry-title, a legend Scripts nao tem classe
  $('legend:not(.entry-title)').each((_, legend) => {
    if (!$(legend).text().trim().includes('Scripts')) return;

    // O ul eirmao da legend dentro do mesmo div pai
    $(legend).parent().find('ul li').each((_, li) => {
      const $li         = $(li);
      const description = $li.text().trim();
      const href        = $li.find('a').attr('href') ?? '';
      const fnMatch     = href.match(/function=(\d+)/);
      const fnId        = fnMatch ? parseInt(fnMatch[1]) : 0;
      const stat        = FUNCTION_TO_STAT[fnId] ?? `fn_${fnId}`;

      // Extrai valores numericos dos badges
      const values: string[] = [];
      $li.find('.badge-warning').each((_, b) => values.push($(b).text().trim()));

      const numericVal = values.find(v => /^-?\d+/.test(v));
      const value      = numericVal ? parseFloat(numericVal) : 0;

      // Condicao: se description contem per/when/if/equip -> complexa
      const condition = /\bper\b|\bwhen\b|\bif\b|\bequip\b/i.test(description)
        ? 'complex'
        : 'always';

      bonuses.push({ stat, value, description, condition, function_id: fnId });
    });
  });

  // 4. Salva no cache (forcando refresh)
  await supabase.from('dp_item_cache').upsert({
    item_id:    itemId,
    data:       { bonuses },
    fetched_at: new Date().toISOString()
  });

  // 5. Persiste em item_bonuses
  if (bonuses.length > 0) {
    await supabase.from('item_bonuses').delete().eq('item_id', itemId);
    await supabase.from('item_bonuses').insert(
      bonuses.map(b => ({
        item_id:   itemId,
        stat:      b.stat,
        value:     Math.round(b.value),
        condition: b.condition,
        is_card:   false,
      }))
    );
  }

  return bonuses;
}

// Scraping em lote com rate limit (1 req/seg)
export async function scrapeItemsBatch(itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    try {
      await scrapeItemBonuses(id);
      console.log(`ok ${id}`);
    } catch (e) {
      console.error(`err ${id}:`, e);
    }
    await new Promise(r => setTimeout(r, 1100));
  }
}

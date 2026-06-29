import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string
);

const FUNCTION_TO_STAT: Record<number, string> = {
  1:   'str',
  2:   'agi',
  3:   'vit',
  4:   'int',
  5:   'dex',
  6:   'luk',
  7:   'hp',
  8:   'sp',
  9:   'hp_percent',
  71:  'sp_percent',
  72:  'hp_regen',
  73:  'sp_regen',
  74:  'hp_regen_flat',
  75:  'sp_regen_flat',
  21:  'atk',
  22:  'matk',
  23:  'atk_percent',
  24:  'matk_percent',
  17:  'aspd',
  108: 'aspd_percent',
  30:  'long_range_atk',
  31:  'short_range_atk',
  33:  'crit_dmg',
  34:  'skill_dmg',
  39:  'normal_atk_dmg',
  10:  'def',
  11:  'mdef',
  13:  'def_percent',
  15:  'mdef_percent',
  60:  'dmg_reduction',
  61:  'ranged_reduction',
  62:  'magic_reduction',
  12:  'hit',
  14:  'crit',
  16:  'flee',
  18:  'perfect_dodge',
  182: 'fixed_cast_reduction',
  183: 'variable_cast_reduction',
  184: 'after_cast_delay',
  185: 'cast_time_percent',
  186: 'fixed_cast_flat',
  812: 'magical_dmg_size',
  310: 'phys_dmg_size',
  311: 'phys_dmg_race',
  813: 'magical_dmg_race',
  55:  'dmg_element',
  224: 'magical_dmg_element',
  56:  'dmg_reduce_race',
  57:  'dmg_reduce_element',
  312: 'dmg_reduce_size',
  200: 'refine_atk',
  201: 'refine_matk',
  202: 'refine_def',
  100: 'exp_bonus',
  101: 'drop_bonus',
  120: 'sp_cost_reduction',
  121: 'heal_effectiveness',
  122: 'received_heal',
  130: 'weapon_atk_bonus',
  131: 'status_atk',
};

const RACE_KEYWORDS: [string, string][] = [
  ['formless',   'race_formless'],
  ['undead',     'race_undead'],
  ['brute',      'race_brute'],
  ['plant',      'race_plant'],
  ['insect',     'race_insect'],
  ['fish',       'race_fish'],
  ['demon',      'race_demon'],
  ['demi-human', 'race_demi_human'],
  ['demihuman',  'race_demi_human'],
  ['angel',      'race_angel'],
  ['dragon',     'race_dragon'],
  ['player',     'race_player'],
];

const ELEMENT_KEYWORDS: [string, string][] = [
  ['neutral',  'ele_neutral'],
  ['water',    'ele_water'],
  ['earth',    'ele_earth'],
  ['fire',     'ele_fire'],
  ['wind',     'ele_wind'],
  ['poison',   'ele_poison'],
  ['holy',     'ele_holy'],
  ['dark',     'ele_dark'],
  ['ghost',    'ele_ghost'],
  ['undead',   'ele_undead'],
];

function resolveStatFromDescription(fnId: number, description: string): string {
  const desc = description.toLowerCase();

  if (fnId === 812 || fnId === 310) {
    const prefix = fnId === 812 ? 'magical_dmg_size' : 'phys_dmg_size';
    if (desc.includes('small'))  return `${prefix}_small`;
    if (desc.includes('medium')) return `${prefix}_medium`;
    if (desc.includes('large'))  return `${prefix}_large`;
    return prefix;
  }

  if (fnId === 311 || fnId === 813) {
    const prefix = fnId === 311 ? 'phys_dmg' : 'magical_dmg';
    for (const [kw, slug] of RACE_KEYWORDS) {
      if (desc.includes(kw)) return `${prefix}_${slug}`;
    }
    return fnId === 311 ? 'phys_dmg_race' : 'magical_dmg_race';
  }

  if (fnId === 55 || fnId === 224) {
    const prefix = fnId === 55 ? 'phys_dmg' : 'magical_dmg';
    for (const [kw, slug] of ELEMENT_KEYWORDS) {
      if (desc.includes(kw)) return `${prefix}_${slug}`;
    }
    return fnId === 55 ? 'dmg_element' : 'magical_dmg_element';
  }

  return FUNCTION_TO_STAT[fnId] ?? `fn_${fnId}`;
}

export interface ScrapedBonus {
  stat:        string;
  value:       number | null;
  description: string;
  condition:   string;
  function_id: number;
}

export async function scrapeItemBonuses(itemId: string): Promise<ScrapedBonus[]> {
  const { data: cached } = await supabase
    .from('dp_item_cache')
    .select('data, fetched_at')
    .eq('item_id', itemId)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return (cached.data as any).bonuses ?? [];
    }
  }

  const res = await fetch(`https://www.divine-pride.net/database/item/${itemId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });

  if (!res.ok) throw new Error(`DP scrape failed: ${res.status}`);

  const html = await res.text();
  const $    = cheerio.load(html);
  const bonuses: ScrapedBonus[] = [];

  $('legend:not(.entry-title)').each((_, legend) => {
    if (!$(legend).text().trim().includes('Scripts')) return;

    $(legend).parent().find('ul li').each((_, li) => {
      const $li         = $(li);
      const description = $li.text().trim();
      const href        = $li.find('a').attr('href') ?? '';
      const fnMatch     = href.match(/function=(\d+)/);
      const fnId        = fnMatch ? parseInt(fnMatch[1]) : 0;

      const stat = resolveStatFromDescription(fnId, description);

      const isComplex = /\bper\b|\bwhen\b|\bif\b|\bequip\b/i.test(description);
      const condition = isComplex ? 'complex' : 'always';

      const values: string[] = [];
      // void explicito: Array.push retorna number, mas cheerio .each espera void|boolean
      $li.find('.badge-warning').each((_, b) => { values.push($(b).text().trim()); });
      const numericVal = values.find(v => /^-?\d+/.test(v));

      const value: number | null = (isComplex && !numericVal)
        ? null
        : numericVal ? parseFloat(numericVal) : 0;

      bonuses.push({ stat, value, description, condition, function_id: fnId });
    });
  });

  await supabase.from('dp_item_cache').upsert({
    item_id:    itemId,
    data:       { bonuses },
    fetched_at: new Date().toISOString()
  });

  if (bonuses.length > 0) {
    await supabase.from('item_bonuses').delete().eq('item_id', itemId);
    await supabase.from('item_bonuses').insert(
      bonuses.map(b => ({
        item_id:   itemId,
        stat:      b.stat,
        value:     b.value !== null ? Math.round(b.value) : null,
        condition: b.condition,
        is_card:   false,
      }))
    );
  }

  return bonuses;
}

export async function scrapeItemsBatch(itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    try {
      await scrapeItemBonuses(id);
      console.log(`ok ${id}`);
    } catch (e) {
      console.error(`err ${id}:`, e);
    }
    await new Promise<void>(r => setTimeout(r, 1100));
  }
}

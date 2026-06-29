import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string
);

// Mapa: function ID do Divine Pride -> stat interno do banco
const FUNCTION_TO_STAT: Record<number, string> = {
  // ── Stats base ──────────────────────────────────────────────────────────
  1:   'str',
  2:   'agi',
  3:   'vit',
  4:   'int',
  5:   'dex',
  6:   'luk',

  // ── HP / SP ─────────────────────────────────────────────────────────────
  7:   'hp',
  8:   'sp',
  9:   'hp_percent',       // bonus bHPrate
  71:  'sp_percent',       // bonus bSPrate
  72:  'hp_regen',         // bonus bHPrecovRate
  73:  'sp_regen',         // bonus bSPrecovRate
  74:  'hp_regen_flat',    // bonus2 bHPRegenRate (valor fixo por tick)
  75:  'sp_regen_flat',    // bonus2 bSPRegenRate

  // ── Combate ofensivo ────────────────────────────────────────────────────
  21:  'atk',
  22:  'matk',
  23:  'atk_percent',      // bonus bAtkRate
  24:  'matk_percent',     // bonus bMatkRate
  17:  'aspd',             // bonus bAspd (reduz delay pos-ataque)
  108: 'aspd_percent',     // bonus bAspdRate (% de ASPD)
  30:  'long_range_atk',   // bonus bLongAtkRate (range attack %)
  31:  'short_range_atk',  // bonus bNearAtkRate (melee attack %)
  33:  'crit_dmg',         // bonus bCritAtkRate
  34:  'skill_dmg',        // bonus bSkillAtk (% de dano de skill)
  39:  'normal_atk_dmg',   // bonus bNormalAtkRes / bBaseAtk

  // ── Combate defensivo ───────────────────────────────────────────────────
  10:  'def',
  11:  'mdef',
  13:  'def_percent',      // bonus bDefRate
  15:  'mdef_percent',     // bonus bMdefRate
  60:  'dmg_reduction',    // bonus bShortWeaponDamageReturn / misc reduction
  61:  'ranged_reduction', // bonus bLongAtkDef
  62:  'magic_reduction',  // bonus bMagicDef (% reducao magica)

  // ── Precisao / Evasao ───────────────────────────────────────────────────
  12:  'hit',
  14:  'crit',
  16:  'flee',
  18:  'perfect_dodge',    // bonus bPerfectHit

  // ── Cast / Delay ────────────────────────────────────────────────────────
  182: 'fixed_cast_reduction',
  183: 'variable_cast_reduction',
  184: 'after_cast_delay',    // bonus bDelayRate (% reducao delay pos-skill)
  185: 'cast_time_percent',   // bonus bCastrate
  186: 'fixed_cast_flat',     // bonus2 bFixedCastrate (ms fixo)

  // ── Dano por tamanho (base — sobrescrito por resolveStatFromDescription) ─
  812: 'magical_dmg_size',
  310: 'phys_dmg_size',        // bonus2 bSizeTolerance / bAddSize (fisico)

  // ── Dano por raca (base — sobrescrito por resolveStatFromDescription) ───
  311: 'phys_dmg_race',        // bonus2 bAddRace
  813: 'magical_dmg_race',     // bonus2 bMagicAddRace

  // ── Dano por elemento (base — sobrescrito por resolveStatFromDescription)
  55:  'dmg_element',          // bonus2 bAddEle (fisico)
  224: 'magical_dmg_element',  // bonus2 bMagicAddEle

  // ── Reducao por raca / elemento / tamanho ───────────────────────────────
  56:  'dmg_reduce_race',      // bonus2 bSubRace
  57:  'dmg_reduce_element',   // bonus2 bSubEle
  312: 'dmg_reduce_size',      // bonus2 bSubSize

  // ── Refino ──────────────────────────────────────────────────────────────
  200: 'refine_atk',           // bonus2 bOverRefAtk
  201: 'refine_matk',          // bonus2 bOverRefMAtk
  202: 'refine_def',           // bonus2 bOverRefDef

  // ── Misc ────────────────────────────────────────────────────────────────
  100: 'exp_bonus',            // bonus bExpAddRace
  101: 'drop_bonus',           // bonus bItemDropAdded
  120: 'sp_cost_reduction',    // bonus bSpCostRate
  121: 'heal_effectiveness',   // bonus bHealPower
  122: 'received_heal',        // bonus bHealPower2
  130: 'weapon_atk_bonus',     // bonus bWeaponAtk
  131: 'status_atk',           // bonus bStatusAtk
};

// ── Racas do Ragnarok (ordem do enum RC_* do rAthena) ────────────────────
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

// ── Elementos do Ragnarok ─────────────────────────────────────────────────
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

/**
 * Para certos function IDs, o stat depende do conteudo da descricao.
 * fn=812 / fn=310 → Small / Medium / Large
 * fn=311 / fn=813 → Raca (Formless, Undead, Brute...)
 * fn=55  / fn=224 → Elemento (Neutral, Water, Fire...)
 */
function resolveStatFromDescription(fnId: number, description: string): string {
  const desc = description.toLowerCase();

  // Dano por tamanho
  if (fnId === 812 || fnId === 310) {
    const prefix = fnId === 812 ? 'magical_dmg_size' : 'phys_dmg_size';
    if (desc.includes('small'))  return `${prefix}_small`;
    if (desc.includes('medium')) return `${prefix}_medium`;
    if (desc.includes('large'))  return `${prefix}_large`;
    return prefix;
  }

  // Dano por raca
  if (fnId === 311 || fnId === 813) {
    const prefix = fnId === 311 ? 'phys_dmg' : 'magical_dmg';
    for (const [kw, slug] of RACE_KEYWORDS) {
      if (desc.includes(kw)) return `${prefix}_${slug}`;
    }
    return fnId === 311 ? 'phys_dmg_race' : 'magical_dmg_race';
  }

  // Dano por elemento
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
  value:       number | null;  // null = bonus existe mas valor e condicional/variavel
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
      $li.find('.badge-warning').each((_, b) => values.push($(b).text().trim()));
      const numericVal = values.find(v => /^-?\d+/.test(v));

      // null quando condicional sem badge fixo (valor variavel)
      const value: number | null = (isComplex && !numericVal)
        ? null
        : numericVal ? parseFloat(numericVal) : 0;

      bonuses.push({ stat, value, description, condition, function_id: fnId });
    });
  });

  // 4. Salva no cache
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
        value:     b.value !== null ? Math.round(b.value) : null,
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

/**
 * bonus-parser.ts
 * Parser de ItemScript/EquipScript no formato eAthena/rAthena.
 * Extrai bônus de stats estruturados a partir do script bruto de cada item.
 */

export interface ParsedBonus {
  stat: string
  value: number
  condition: string   // 'always' | 'class:knight' | 'refine>=9' | 'equip:shield' | 'complex'
  job_id?: string
  skill_mod?: string
  is_card?: boolean
}

/** Mapa: nome do bonus Athena → stat normalizado */
const STAT_MAP: Record<string, string> = {
  // Stats base
  bStr: 'str',   bAgi: 'agi',   bVit: 'vit',   bInt: 'int',
  bDex: 'dex',   bLuk: 'luk',
  // Ataque / Defesa
  bAtk: 'atk',   bAtk2: 'atk',  bMatk: 'matk', bMatk2: 'matk',
  bDef: 'def',   bDef2: 'def',  bMdef: 'mdef', bMdef2: 'mdef',
  // Acerto / Esquiva
  bHit: 'hit',   bHit2: 'hit',
  bFlee: 'flee', bFlee2: 'perfect_dodge',
  // Crítico / ASPD
  bCritical: 'crit', bCritical2: 'crit',
  bAspd: 'aspd', bAspdRate: 'aspd_pct',
  // HP / SP
  bMaxHP: 'hp',        bMaxSP: 'sp',
  bMaxHPrate: 'hp_pct', bMaxSPrate: 'sp_pct',
  bHPrecovRate: 'hp_regen', bSPrecovRate: 'sp_regen',
  bHPGainValue: 'hp_gain', bSPGainValue: 'sp_gain',
  // Dano
  bAllStats: 'all_stats',
  bCritAtkRate: 'crit_dmg',
  bLongAtkRate: 'ranged_dmg',
  bShortAtkRate: 'melee_dmg',
  bMagicAtkEle: 'magic_ele_dmg',
  bNoMagicDmg: 'reflect_magic',
  bNoWeaponDmg: 'reflect_melee',
  bWeaponAtkRate: 'weapon_atk_pct',
  bMagicDamageReturn: 'magic_reflect_pct',
  // Misc
  bSpeedRate: 'movspd',
  bSpeedAddRate: 'movspd',
  bFixedCastrate: 'fixed_cast_pct',
  bVariableCastrate: 'var_cast_pct',
  bCastrate: 'cast_pct',
  bDelayrate: 'aftercast_pct',
  bNoGemStone: 'no_gemstone',
  bIntravision: 'see_hidden',
  bPerfectHitRate: 'perfect_hit',
  bPerfectHitAddRate: 'perfect_hit',
  bUnbreakableWeapon: 'unbreakable',
  bUnbreakableArmor: 'unbreakable',
}

/** Mapa: Job_X do script → job_id da tabela */
const JOB_MAP: Record<string, string> = {
  Novice: 'novice', Swordman: 'swordman', Mage: 'mage',
  Archer: 'archer', Acolyte: 'acolyte', Merchant: 'merchant',
  Thief: 'thief', Knight: 'knight', Wizard: 'wizard',
  Priest: 'priest', Hunter: 'hunter', Blacksmith: 'blacksmith',
  Assassin: 'assassin', Crusader: 'crusader', Sage: 'sage',
  Bard: 'bard', Dancer: 'dancer', Rogue: 'rogue', Alchemist: 'alchemist',
  SuperNovice: 'super_novice', Gunslinger: 'gunslinger', Ninja: 'ninja',
  // 3rd jobs
  RuneKnight: 'rune_knight', RoyalGuard: 'royal_guard',
  Warlock: 'warlock', Sorcerer: 'sorcerer',
  Ranger: 'ranger', Wanderer: 'wanderer', Minstrel: 'minstrel',
  ArchBishop: 'arch_bishop', Sura: 'sura',
  Mechanic: 'mechanic', Genetic: 'genetic',
  GuillotineCross: 'guillotine_cross', ShadowChaser: 'shadow_chaser',
  // Trans
  LordKnight: 'lord_knight', Paladin: 'paladin',
  HighWizard: 'high_wizard', Professor: 'professor',
  Sniper: 'sniper', Clown: 'clown', Gypsy: 'gypsy',
  HighPriest: 'high_priest', Champion: 'champion',
  Mastersmith: 'mastersmith', Creator: 'creator',
  AssassinCross: 'assassin_cross', Stalker: 'stalker',
}

/** Mapa: RC_X → slug de raça normalizado */
const RACE_MAP: Record<string, string> = {
  RC_Formless: 'formless', RC_Undead: 'undead', RC_Brute: 'brute',
  RC_Plant: 'plant', RC_Insect: 'insect', RC_Fish: 'fish',
  RC_Demon: 'demon', RC_DemiHuman: 'demi_human', RC_Angel: 'angel',
  RC_Dragon: 'dragon', RC_Boss: 'boss', RC_NonBoss: 'non_boss',
  RC_Player: 'player', RC_NonPlayer: 'non_player',
}

/** Mapa: Ele_X → slug de elemento normalizado */
const ELE_MAP: Record<string, string> = {
  Ele_Neutral: 'neutral', Ele_Water: 'water', Ele_Earth: 'earth',
  Ele_Fire: 'fire', Ele_Wind: 'wind', Ele_Poison: 'poison',
  Ele_Holy: 'holy', Ele_Dark: 'dark', Ele_Ghost: 'ghost',
  Ele_Undead: 'undead', Ele_All: 'all',
}

/** Mapa: Class_X → slug de classe de monstro normalizado */
const CLASS_MAP: Record<string, string> = {
  Class_Normal: 'normal', Class_Boss: 'boss',
  Class_Guardian: 'guardian', Class_Battlefield: 'battlefield',
}

/**
 * Parseia um script Athena e retorna array de bônus estruturados.
 * @param script - conteúdo do ItemScript ou EquipScript
 */
export function parseBonusScript(script: string): ParsedBonus[] {
  if (!script || script.trim() === '') return []

  const bonuses: ParsedBonus[] = []
  let currentCondition = 'always'
  let currentJobId: string | undefined

  // Detecta condicionais de classe: if(BaseClass==Job_Knight) ou if(Class==Job_Knight)
  const classCondMatch = script.match(
    /if\s*\(\s*(?:BaseClass|Class)\s*==\s*Job_(\w+)\s*\)/i
  )
  if (classCondMatch) {
    const rawJob = classCondMatch[1]
    currentJobId = JOB_MAP[rawJob] ?? rawJob.toLowerCase()
    currentCondition = `class:${currentJobId}`
  }

  // Detecta condicionais de refine: if(getrefine()>=9)
  const refineMatch = script.match(/if\s*\(\s*getrefine\s*\(\s*\)\s*([><=!]+)\s*(\d+)\s*\)/i)
  if (refineMatch) {
    currentCondition = `refine${refineMatch[1]}${refineMatch[2]}`
  }

  // Detecta condicionais de equip shield: if(shield())
  if (/\bshield\s*\(\s*\)/.test(script)) {
    currentCondition = 'equip:shield'
  }

  // ── bonus bStat,value ──────────────────────────────────────────────────────
  const bonusRegex = /\bbonus\s+(b\w+)\s*,\s*(-?\d+)\s*;/gi
  let m: RegExpExecArray | null
  while ((m = bonusRegex.exec(script)) !== null) {
    const athenaKey = m[1]
    const value = parseInt(m[2], 10)
    const stat = STAT_MAP[athenaKey]
    if (stat && value !== 0) {
      bonuses.push({ stat, value, condition: currentCondition, job_id: currentJobId })
    }
  }

  // ── bonus2 bSkillAtk,"SKILL_ID",value ─────────────────────────────────────
  const skillAtkRegex = /\bbonus2\s+bSkillAtk\s*,\s*["']?(\w+)["']?\s*,\s*(-?\d+)\s*;/gi
  while ((m = skillAtkRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'skill_atk',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:atk`,
    })
  }

  // ── bonus2 bSkillHeal,"SKILL_ID",value ────────────────────────────────────
  const skillHealRegex = /\bbonus2\s+bSkillHeal\s*,\s*["']?(\w+)["']?\s*,\s*(-?\d+)\s*;/gi
  while ((m = skillHealRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'skill_heal',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:heal`,
    })
  }

  // ── bonus2 bSkillCooldown,"SKILL_ID",value ────────────────────────────────
  const skillCdRegex = /\bbonus2\s+bSkillCooldown\s*,\s*["']?(\w+)["']?\s*,\s*(-?\d+)\s*;/gi
  while ((m = skillCdRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'skill_cooldown',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:cooldown`,
    })
  }

  // ── bonus2 bSkillVariableCast,"SKILL_ID",value ────────────────────────────
  const skillCastRegex = /\bbonus2\s+bSkillVariableCast\s*,\s*["']?(\w+)["']?\s*,\s*(-?\d+)\s*;/gi
  while ((m = skillCastRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'skill_cast',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:cast`,
    })
  }

  // ── bonus2 bAddEle, Ele_X, value — dano elemental ofensivo ────────────────
  const eleAtkRegex = /\bbonus2\s+bAddEle\s*,\s*(Ele_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = eleAtkRegex.exec(script)) !== null) {
    const ele = ELE_MAP[m[1]] ?? m[1].replace('Ele_', '').toLowerCase()
    bonuses.push({
      stat: `ele_atk_${ele}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bSubEle, Ele_X, value — resistência elemental ──────────────────
  const eleResRegex = /\bbonus2\s+bSubEle\s*,\s*(Ele_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = eleResRegex.exec(script)) !== null) {
    const ele = ELE_MAP[m[1]] ?? m[1].replace('Ele_', '').toLowerCase()
    bonuses.push({
      stat: `ele_res_${ele}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bMagicAddEle, Ele_X, value — dano mágico elemental ────────────
  const magicEleRegex = /\bbonus2\s+bMagicAddEle\s*,\s*(Ele_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = magicEleRegex.exec(script)) !== null) {
    const ele = ELE_MAP[m[1]] ?? m[1].replace('Ele_', '').toLowerCase()
    bonuses.push({
      stat: `magic_ele_atk_${ele}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bAddRace, RC_X, value — dano vs raça ───────────────────────────
  const raceAtkRegex = /\bbonus2\s+bAddRace\s*,\s*(RC_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = raceAtkRegex.exec(script)) !== null) {
    const race = RACE_MAP[m[1]] ?? m[1].replace('RC_', '').toLowerCase()
    bonuses.push({
      stat: `race_atk_${race}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bSubRace, RC_X, value — resistência vs raça ───────────────────
  const raceResRegex = /\bbonus2\s+bSubRace\s*,\s*(RC_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = raceResRegex.exec(script)) !== null) {
    const race = RACE_MAP[m[1]] ?? m[1].replace('RC_', '').toLowerCase()
    bonuses.push({
      stat: `race_res_${race}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bMagicAddRace, RC_X, value — dano mágico vs raça ──────────────
  const magicRaceRegex = /\bbonus2\s+bMagicAddRace\s*,\s*(RC_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = magicRaceRegex.exec(script)) !== null) {
    const race = RACE_MAP[m[1]] ?? m[1].replace('RC_', '').toLowerCase()
    bonuses.push({
      stat: `magic_race_atk_${race}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bSubSize, Size_X, value — resistência por tamanho ─────────────
  const sizeResRegex = /\bbonus2\s+bSubSize\s*,\s*(\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = sizeResRegex.exec(script)) !== null) {
    const size = m[1].replace('Size_', '').toLowerCase()
    bonuses.push({
      stat: `size_res_${size}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bAddSize, Size_X, value — dano vs tamanho ─────────────────────
  const sizeAtkRegex = /\bbonus2\s+bAddSize\s*,\s*(\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = sizeAtkRegex.exec(script)) !== null) {
    const size = m[1].replace('Size_', '').toLowerCase()
    bonuses.push({
      stat: `size_atk_${size}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bAddClass, Class_X, value — dano vs classe de monstro ─────────
  const classAtkRegex = /\bbonus2\s+bAddClass\s*,\s*(Class_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = classAtkRegex.exec(script)) !== null) {
    const cls = CLASS_MAP[m[1]] ?? m[1].replace('Class_', '').toLowerCase()
    bonuses.push({
      stat: `class_atk_${cls}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bIgnoreDefRaceRate, RC_X, value — ignora DEF vs raça ──────────
  const ignoreDefRegex = /\bbonus2\s+bIgnoreDefRaceRate\s*,\s*(RC_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = ignoreDefRegex.exec(script)) !== null) {
    const race = RACE_MAP[m[1]] ?? m[1].replace('RC_', '').toLowerCase()
    bonuses.push({
      stat: `ignore_def_${race}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bIgnoreMdefRate, RC_X, value — ignora MDEF vs raça ────────────
  const ignoreMdefRegex = /\bbonus2\s+bIgnoreMdefRate\s*,\s*(RC_\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = ignoreMdefRegex.exec(script)) !== null) {
    const race = RACE_MAP[m[1]] ?? m[1].replace('RC_', '').toLowerCase()
    bonuses.push({
      stat: `ignore_mdef_${race}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus3 bAutoSpell,"SKILL",lv,chance — auto-cast ao atacar ────────────
  const autoSpellRegex = /\bbonus3\s+bAutoSpell\s*,\s*["']?(\w+)["']?\s*,\s*(\d+)\s*,\s*(\d+)\s*;/gi
  while ((m = autoSpellRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'auto_spell',
      value: parseInt(m[3], 10),   // chance %
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:lv${m[2]}:onhit`,
    })
  }

  // ── bonus3 bAutoSpellWhenHit,"SKILL",lv,chance — auto-cast ao ser atingido
  const autoSpellHitRegex = /\bbonus3\s+bAutoSpellWhenHit\s*,\s*["']?(\w+)["']?\s*,\s*(\d+)\s*,\s*(\d+)\s*;/gi
  while ((m = autoSpellHitRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'auto_spell_hit',
      value: parseInt(m[3], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:lv${m[2]}:onhit`,
    })
  }

  // ── bonus4 bAutoSpell,"SKILL",lv,chance,flag ─────────────────────────────
  const autoSpell4Regex = /\bbonus4\s+bAutoSpell\s*,\s*["']?(\w+)["']?\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*;/gi
  while ((m = autoSpell4Regex.exec(script)) !== null) {
    bonuses.push({
      stat: 'auto_spell',
      value: parseInt(m[3], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:lv${m[2]}:flag${m[4]}`,
    })
  }

  // ── bonus2 bHPDrainRate, value, percent — drena HP ao atacar ─────────────
  const hpDrainRegex = /\bbonus2\s+bHPDrainRate\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = hpDrainRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'hp_drain',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── bonus2 bSPDrainRate, value, percent — drena SP ao atacar ─────────────
  const spDrainRegex = /\bbonus2\s+bSPDrainRate\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = spDrainRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'sp_drain',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // ── skill SKILL_ID,level — concede skill ──────────────────────────────────
  const grantSkillRegex = /\bskill\s+(\w+)\s*,\s*(\d+)\s*;/gi
  while ((m = grantSkillRegex.exec(script)) !== null) {
    bonuses.push({
      stat: 'grant_skill',
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
      skill_mod: `${m[1]}:grant`,
    })
  }

  // ── Marca como 'complex' se ainda há bonus não capturado e não parseiamos nada
  // Remove tudo que já foi capturado e checa se resta algum bonus[234]? bXxx
  const stripped = script
    .replace(/\bbonus\s+b\w+\s*,\s*-?\d+\s*;/gi, '')
    .replace(/\bbonus2\s+b\w+\s*,\s*[^;]+;/gi, '')
    .replace(/\bbonus3\s+b\w+\s*,\s*[^;]+;/gi, '')
    .replace(/\bbonus4\s+b\w+\s*,\s*[^;]+;/gi, '')
    .replace(/\bskill\s+\w+\s*,\s*\d+\s*;/gi, '')

  const hasUncaptured = /\bbonus[234]?\s+b\w+/.test(stripped)
  if (hasUncaptured && bonuses.length === 0) {
    bonuses.push({ stat: 'complex', value: 0, condition: 'complex' })
  }

  return bonuses
}

/**
 * Retorna os stats mais relevantes de um item com seus valores máximos.
 * Útil para ranking rápido no advisor.
 */
export function summarizeBonuses(bonuses: ParsedBonus[]): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const b of bonuses) {
    if (b.condition !== 'complex') {
      summary[b.stat] = (summary[b.stat] ?? 0) + b.value
    }
  }
  return summary
}

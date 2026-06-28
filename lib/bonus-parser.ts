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
  bStr: 'str',   bAgi: 'agi',   bVit: 'vit',   bInt: 'int',
  bDex: 'dex',   bLuk: 'luk',   bAtk: 'atk',   bMatk: 'matk',
  bDef: 'def',   bMdef: 'mdef', bHit: 'hit',   bFlee: 'flee',
  bFlee2: 'perfect_dodge', bCritical: 'crit', bAspd: 'aspd',
  bMaxHP: 'hp',  bMaxSP: 'sp',  bMaxHPrate: 'hp_pct', bMaxSPrate: 'sp_pct',
  bHPrecovRate: 'hp_regen', bSPrecovRate: 'sp_regen',
  bAllStats: 'all_stats', bCritAtkRate: 'crit_dmg',
  bLongAtkRate: 'ranged_dmg', bShortAtkRate: 'melee_dmg',
  bMagicAtkEle: 'magic_ele_dmg',
  bNoMagicDmg: 'reflect_magic', bNoWeaponDmg: 'reflect_melee',
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

  // --- bonus bStat,value ---
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

  // --- bonus2 bSkillAtk,"SKILL_ID",value ---
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

  // --- bonus2 bSkillHeal,"SKILL_ID",value ---
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

  // --- bonus2 bAddEle,Ele_X,value --- (dano elemental)
  const eleRegex = /\bbonus2\s+bAddEle\s*,\s*Ele_(\w+)\s*,\s*(-?\d+)\s*;/gi
  while ((m = eleRegex.exec(script)) !== null) {
    bonuses.push({
      stat: `ele_${m[1].toLowerCase()}`,
      value: parseInt(m[2], 10),
      condition: currentCondition,
      job_id: currentJobId,
    })
  }

  // --- skill SKILL_ID,level (concede skill) ---
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

  // Marca como 'complex' se ainda há bonus não capturado
  const hasUncaptured = /\bbonus[23]?\s+b\w+/.test(
    script.replace(bonusRegex, '').replace(skillAtkRegex, '').replace(skillHealRegex, '')
  )
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

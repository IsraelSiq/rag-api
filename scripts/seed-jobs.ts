/**
 * scripts/seed-jobs.ts
 *
 * Popula a tabela `jobs` com toda a árvore de classes do Ragnarok Online.
 * Cobre: Novice, 1st, 2nd, Transcendent, 3rd, 4th jobs + especiais.
 *
 * Uso:
 *   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/seed-jobs.ts
 *
 * Flags:
 *   --dry-run   Mostra os jobs sem gravar
 *   --reset     Apaga todos os jobs antes de inserir
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente')
  process.exit(1)
}

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const RESET   = args.includes('--reset')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ──────────────────────────────────────────────────
interface JobSeed {
  id: string
  name: string
  tier: number        // 1=base, 2=1st, 3=2nd, 4=trans, 5=3rd, 6=4th
  parent_id?: string
  skill_points?: number
  expanded?: boolean
}

const JOBS: JobSeed[] = [

  // ─────────────────────────────────────────
  // TIER 1 — Base
  // ─────────────────────────────────────────
  { id: 'novice',    name: 'Novice',    tier: 1 },

  // ─────────────────────────────────────────
  // TIER 2 — 1st jobs
  // ─────────────────────────────────────────
  { id: 'swordman',     name: 'Swordman',     tier: 2, parent_id: 'novice', skill_points: 42 },
  { id: 'mage',         name: 'Mage',         tier: 2, parent_id: 'novice', skill_points: 44 },
  { id: 'archer',       name: 'Archer',       tier: 2, parent_id: 'novice', skill_points: 44 },
  { id: 'acolyte',      name: 'Acolyte',      tier: 2, parent_id: 'novice', skill_points: 44 },
  { id: 'merchant',     name: 'Merchant',     tier: 2, parent_id: 'novice', skill_points: 44 },
  { id: 'thief',        name: 'Thief',        tier: 2, parent_id: 'novice', skill_points: 44 },
  // Expanded 1st
  { id: 'super_novice', name: 'Super Novice', tier: 2, parent_id: 'novice', skill_points: 69, expanded: true },
  { id: 'gunslinger',   name: 'Gunslinger',   tier: 2, parent_id: 'novice', skill_points: 50, expanded: true },
  { id: 'ninja',        name: 'Ninja',        tier: 2, parent_id: 'novice', skill_points: 42, expanded: true },
  { id: 'taekwon',      name: 'Taekwon',      tier: 2, parent_id: 'novice', skill_points: 35, expanded: true },

  // ─────────────────────────────────────────
  // TIER 3 — 2nd jobs
  // ─────────────────────────────────────────
  { id: 'knight',      name: 'Knight',      tier: 3, parent_id: 'swordman', skill_points: 48 },
  { id: 'crusader',    name: 'Crusader',    tier: 3, parent_id: 'swordman', skill_points: 48 },
  { id: 'wizard',      name: 'Wizard',      tier: 3, parent_id: 'mage',     skill_points: 45 },
  { id: 'sage',        name: 'Sage',        tier: 3, parent_id: 'mage',     skill_points: 45 },
  { id: 'hunter',      name: 'Hunter',      tier: 3, parent_id: 'archer',   skill_points: 48 },
  { id: 'bard',        name: 'Bard',        tier: 3, parent_id: 'archer',   skill_points: 46 },
  { id: 'dancer',      name: 'Dancer',      tier: 3, parent_id: 'archer',   skill_points: 46 },
  { id: 'priest',      name: 'Priest',      tier: 3, parent_id: 'acolyte',  skill_points: 48 },
  { id: 'monk',        name: 'Monk',        tier: 3, parent_id: 'acolyte',  skill_points: 48 },
  { id: 'blacksmith',  name: 'Blacksmith',  tier: 3, parent_id: 'merchant', skill_points: 48 },
  { id: 'alchemist',   name: 'Alchemist',   tier: 3, parent_id: 'merchant', skill_points: 48 },
  { id: 'assassin',    name: 'Assassin',    tier: 3, parent_id: 'thief',    skill_points: 48 },
  { id: 'rogue',       name: 'Rogue',       tier: 3, parent_id: 'thief',    skill_points: 48 },
  // Expanded 2nd
  { id: 'star_gladiator', name: 'Star Gladiator', tier: 3, parent_id: 'taekwon', skill_points: 35, expanded: true },
  { id: 'soul_linker',    name: 'Soul Linker',    tier: 3, parent_id: 'taekwon', skill_points: 35, expanded: true },

  // ─────────────────────────────────────────
  // TIER 4 — Transcendent (Rebirth)
  // ─────────────────────────────────────────
  { id: 'high_novice',   name: 'High Novice',   tier: 4, parent_id: 'novice' },
  { id: 'high_swordman', name: 'High Swordman', tier: 4, parent_id: 'swordman' },
  { id: 'high_mage',     name: 'High Mage',     tier: 4, parent_id: 'mage' },
  { id: 'high_archer',   name: 'High Archer',   tier: 4, parent_id: 'archer' },
  { id: 'high_acolyte',  name: 'High Acolyte',  tier: 4, parent_id: 'acolyte' },
  { id: 'high_merchant', name: 'High Merchant', tier: 4, parent_id: 'merchant' },
  { id: 'high_thief',    name: 'High Thief',    tier: 4, parent_id: 'thief' },
  // Trans 2nd
  { id: 'lord_knight',    name: 'Lord Knight',    tier: 4, parent_id: 'knight',     skill_points: 62 },
  { id: 'paladin',        name: 'Paladin',        tier: 4, parent_id: 'crusader',   skill_points: 62 },
  { id: 'high_wizard',    name: 'High Wizard',    tier: 4, parent_id: 'wizard',     skill_points: 62 },
  { id: 'professor',      name: 'Professor',      tier: 4, parent_id: 'sage',       skill_points: 62 },
  { id: 'sniper',         name: 'Sniper',         tier: 4, parent_id: 'hunter',     skill_points: 62 },
  { id: 'clown',          name: 'Clown',          tier: 4, parent_id: 'bard',       skill_points: 62 },
  { id: 'gypsy',          name: 'Gypsy',          tier: 4, parent_id: 'dancer',     skill_points: 62 },
  { id: 'high_priest',    name: 'High Priest',    tier: 4, parent_id: 'priest',     skill_points: 62 },
  { id: 'champion',       name: 'Champion',       tier: 4, parent_id: 'monk',       skill_points: 62 },
  { id: 'mastersmith',    name: 'Mastersmith',    tier: 4, parent_id: 'blacksmith', skill_points: 62 },
  { id: 'creator',        name: 'Creator',        tier: 4, parent_id: 'alchemist',  skill_points: 62 },
  { id: 'assassin_cross', name: 'Assassin Cross', tier: 4, parent_id: 'assassin',   skill_points: 62 },
  { id: 'stalker',        name: 'Stalker',        tier: 4, parent_id: 'rogue',      skill_points: 62 },

  // ─────────────────────────────────────────
  // TIER 5 — 3rd jobs (Renewal)
  // ─────────────────────────────────────────
  { id: 'rune_knight',      name: 'Rune Knight',      tier: 5, parent_id: 'lord_knight',    skill_points: 70 },
  { id: 'royal_guard',      name: 'Royal Guard',      tier: 5, parent_id: 'paladin',        skill_points: 70 },
  { id: 'warlock',          name: 'Warlock',          tier: 5, parent_id: 'high_wizard',    skill_points: 70 },
  { id: 'sorcerer',         name: 'Sorcerer',         tier: 5, parent_id: 'professor',      skill_points: 70 },
  { id: 'ranger',           name: 'Ranger',           tier: 5, parent_id: 'sniper',         skill_points: 70 },
  { id: 'minstrel',         name: 'Minstrel',         tier: 5, parent_id: 'clown',          skill_points: 70 },
  { id: 'wanderer',         name: 'Wanderer',         tier: 5, parent_id: 'gypsy',          skill_points: 70 },
  { id: 'arch_bishop',      name: 'Arch Bishop',      tier: 5, parent_id: 'high_priest',    skill_points: 70 },
  { id: 'sura',             name: 'Sura',             tier: 5, parent_id: 'champion',       skill_points: 70 },
  { id: 'mechanic',         name: 'Mechanic',         tier: 5, parent_id: 'mastersmith',    skill_points: 70 },
  { id: 'genetic',          name: 'Genetic',          tier: 5, parent_id: 'creator',        skill_points: 70 },
  { id: 'guillotine_cross', name: 'Guillotine Cross', tier: 5, parent_id: 'assassin_cross', skill_points: 70 },
  { id: 'shadow_chaser',    name: 'Shadow Chaser',    tier: 5, parent_id: 'stalker',        skill_points: 70 },
  // Expanded 3rd
  { id: 'kagerou',      name: 'Kagerou',      tier: 5, parent_id: 'ninja',          skill_points: 70, expanded: true },
  { id: 'oboro',        name: 'Oboro',        tier: 5, parent_id: 'ninja',          skill_points: 70, expanded: true },
  { id: 'rebellion',    name: 'Rebellion',    tier: 5, parent_id: 'gunslinger',     skill_points: 70, expanded: true },
  { id: 'star_emperor', name: 'Star Emperor', tier: 5, parent_id: 'star_gladiator', skill_points: 70, expanded: true },
  { id: 'soul_reaper',  name: 'Soul Reaper',  tier: 5, parent_id: 'soul_linker',   skill_points: 70, expanded: true },

  // ─────────────────────────────────────────
  // TIER 6 — 4th jobs
  // ─────────────────────────────────────────
  { id: 'dragon_knight',    name: 'Dragon Knight',    tier: 6, parent_id: 'rune_knight',   skill_points: 75 },
  { id: 'meister',          name: 'Meister',          tier: 6, parent_id: 'royal_guard',   skill_points: 75 },
  { id: 'arch_mage',        name: 'Arch Mage',        tier: 6, parent_id: 'warlock',       skill_points: 75 },
  { id: 'elemental_master', name: 'Elemental Master', tier: 6, parent_id: 'sorcerer',      skill_points: 75 },
  { id: 'wind_hawk',        name: 'Wind Hawk',        tier: 6, parent_id: 'ranger',        skill_points: 75 },
  { id: 'troubadour',       name: 'Troubadour',       tier: 6, parent_id: 'minstrel',      skill_points: 75 },
  { id: 'trouvere',         name: 'Trouvere',         tier: 6, parent_id: 'wanderer',      skill_points: 75 },
  { id: 'inquisitor',       name: 'Inquisitor',       tier: 6, parent_id: 'arch_bishop',   skill_points: 75 },
  { id: 'imperial_guard',   name: 'Imperial Guard',   tier: 6, parent_id: 'sura',          skill_points: 75 },
  { id: 'biolo',            name: 'Biolo',            tier: 6, parent_id: 'genetic',       skill_points: 75 },
  { id: 'abyss_chaser',     name: 'Abyss Chaser',     tier: 6, parent_id: 'shadow_chaser', skill_points: 75 },
  { id: 'night_watch',      name: 'Night Watch',      tier: 6, parent_id: 'rebellion',     skill_points: 75, expanded: true },
  { id: 'sky_emperor',      name: 'Sky Emperor',      tier: 6, parent_id: 'star_emperor',  skill_points: 75, expanded: true },
  { id: 'soul_ascetic',     name: 'Soul Ascetic',     tier: 6, parent_id: 'soul_reaper',   skill_points: 75, expanded: true },
  { id: 'shinkiro',         name: 'Shinkiro',         tier: 6, parent_id: 'kagerou',       skill_points: 75, expanded: true },
  { id: 'shiranui',         name: 'Shiranui',         tier: 6, parent_id: 'oboro',         skill_points: 75, expanded: true },
]

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n👩‍💻  seed-jobs.ts')
  console.log(`   Modo  : ${DRY_RUN ? 'DRY RUN' : 'PRODUÇÃO'}`)
  console.log(`   Total : ${JOBS.length} jobs\n`)

  const byTier: Record<number, string[]> = {}
  for (const j of JOBS) {
    byTier[j.tier] = byTier[j.tier] ?? []
    byTier[j.tier].push(j.name)
  }
  const tierLabels: Record<number, string> = {
    1: 'Base', 2: '1st / Expanded', 3: '2nd',
    4: 'Trans', 5: '3rd', 6: '4th',
  }
  for (const [tier, names] of Object.entries(byTier)) {
    console.log(`  Tier ${tier} (${tierLabels[+tier]}): ${names.join(', ')}`)
  }
  console.log('')

  if (DRY_RUN) {
    console.log('💡 Dry run — nada foi gravado.')
    return
  }

  if (RESET) {
    console.log('🗑️  Removendo jobs existentes...')
    for (const j of [...JOBS].reverse()) {
      await supabase.from('jobs').delete().eq('id', j.id)
    }
    console.log('   ✔ Removidos.\n')
  }

  let inserted = 0
  const errors: string[] = []

  for (const job of JOBS) {
    const { error } = await supabase
      .from('jobs')
      .upsert({
        id:           job.id,
        name:         job.name,
        tier:         job.tier,
        parent_id:    job.parent_id ?? null,
        skill_points: job.skill_points ?? 0,
        expanded:     job.expanded ?? false,
      }, { onConflict: 'id' })

    if (error) {
      errors.push(`${job.id}: ${error.message}`)
    } else {
      inserted++
      process.stdout.write(`\r  Inserindo... ${inserted}/${JOBS.length} (${job.name.padEnd(24)})`)
    }
  }

  console.log(`\n\n${'─'.repeat(50)}`)
  console.log('📊  RELATÓRIO FINAL')
  console.log('─'.repeat(50))
  console.log(`  Inseridos : ${inserted}`)
  console.log(`  Erros     : ${errors.length}`)

  if (errors.length > 0) {
    console.log('\n⚠️  Erros:')
    errors.forEach(e => console.log('  ', e))
  }

  if (errors.length === 0) {
    console.log(`\n✅  jobs populado com sucesso! (${inserted} classes)`)
    console.log(`   Próximo passo:`)
    console.log(`   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/seed-skills.ts`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

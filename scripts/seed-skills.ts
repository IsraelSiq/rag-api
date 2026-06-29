/**
 * scripts/seed-skills.ts
 *
 * Popula a tabela `skills` a partir do skill_db.yml do rAthena GitHub.
 * Relaciona cada skill ao job_id correto via mapa estático.
 *
 * Uso:
 *   npx dotenv -- ts-node --project tsconfig.scripts.json scripts/seed-skills.ts
 *
 * Flags:
 *   --dry-run   Preview sem gravar
 *   --reset     Apaga skills existentes antes de inserir
 *   --limit=N   Processa apenas os primeiros N skills
 */

import { createClient } from '@supabase/supabase-js'
import * as https from 'https'

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente')
  process.exit(1)
}

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const RESET   = args.includes('--reset')
const LIMIT   = (() => { const l = args.find(a => a.startsWith('--limit=')); return l ? parseInt(l.split('=')[1]) : Infinity })() 

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// URL do skill_db.yml no rAthena GitHub
const SKILL_DB_URL = 'https://raw.githubusercontent.com/rathena/rathena/master/db/re/skill_db.yml'

// ───────────────────────────────────────────────
// Mapa: prefixo da skill ID → job_id da tabela jobs
// (usado como fallback — skill_db.yml não tem job explícito)
const SKILL_PREFIX_TO_JOB: Array<[RegExp, string]> = [
  // Novice / Basic
  [/^NV_/i,  'novice'],
  [/^SM_/i,  'swordman'],
  [/^MG_/i,  'mage'],
  [/^AC_/i,  'archer'],
  [/^AL_/i,  'acolyte'],
  [/^MC_/i,  'merchant'],
  [/^TF_/i,  'thief'],
  // 2nd jobs
  [/^KN_/i,  'knight'],
  [/^CR_/i,  'crusader'],
  [/^WZ_/i,  'wizard'],
  [/^SA_/i,  'sage'],
  [/^HT_/i,  'hunter'],
  [/^BA_/i,  'bard'],
  [/^DC_/i,  'dancer'],
  [/^PR_/i,  'priest'],
  [/^MO_/i,  'monk'],
  [/^BS_/i,  'blacksmith'],
  [/^AM_/i,  'alchemist'],
  [/^AS_/i,  'assassin'],
  [/^RG_/i,  'rogue'],
  // Trans
  [/^LK_/i,  'lord_knight'],
  [/^PA_/i,  'paladin'],
  [/^HW_/i,  'high_wizard'],
  [/^PF_/i,  'professor'],
  [/^SN_/i,  'sniper'],
  [/^CG_/i,  'clown'],
  [/^HP_/i,  'high_priest'],
  [/^CH_/i,  'champion'],
  [/^WS_/i,  'mastersmith'],
  [/^CR_/i,  'creator'],
  [/^SG_/i,  'star_gladiator'],
  [/^SL_/i,  'soul_linker'],
  [/^ST_/i,  'stalker'],
  // 3rd jobs
  [/^RK_/i,  'rune_knight'],
  [/^RG_/i,  'royal_guard'],
  [/^WL_/i,  'warlock'],
  [/^SO_/i,  'sorcerer'],
  [/^GS_/i,  'gunslinger'],
  [/^RA_/i,  'ranger'],
  [/^MI_/i,  'minstrel'],
  [/^WA_/i,  'wanderer'],
  [/^AB_/i,  'arch_bishop'],
  [/^SR_/i,  'sura'],
  [/^NC_/i,  'mechanic'],
  [/^GN_/i,  'genetic'],
  [/^GC_/i,  'guillotine_cross'],
  [/^SC_/i,  'shadow_chaser'],
  [/^NJ_/i,  'ninja'],
  [/^KO_/i,  'kagerou'],
  [/^OB_/i,  'oboro'],
  [/^RL_/i,  'rebellion'],
  [/^SX_/i,  'star_emperor'],
  [/^SP_/i,  'soul_reaper'],
  // 4th jobs
  [/^DK_/i,  'dragon_knight'],
  [/^MS_/i,  'meister'],
  [/^AM_/i,  'arch_mage'],
  [/^EM_/i,  'elemental_master'],
  [/^WH_/i,  'wind_hawk'],
  [/^TR_/i,  'troubadour'],
  [/^TV_/i,  'trouvere'],
  [/^IQ_/i,  'inquisitor'],
  [/^IG_/i,  'imperial_guard'],
  [/^BO_/i,  'biolo'],
  [/^AC_/i,  'abyss_chaser'],
  [/^NW_/i,  'night_watch'],
  [/^SE_/i,  'sky_emperor'],
  [/^SCA_/i, 'soul_ascetic'],
  [/^SHR_/i, 'shinkiro'],
  [/^SHI_/i, 'shiranui'],
]

// Mapa explícito de type do rAthena → tipo normalizado
const TYPE_MAP: Record<string, 'active' | 'passive' | 'toggle'> = {
  'Passive':    'passive',
  'Active':     'active',
  'Toggle':     'toggle',
  'Magic':      'active',
  'Weapon':     'active',
  'Ground':     'active',
  'Trap':       'active',
  'Self':       'active',
  'Support':    'active',
  'Neutral':    'active',
}

// ── Helpers ─────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject)
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

/**
 * Parser minimalista de YAML skill_db.yml do rAthena.
 * Não usa lib externa — extrai blocos por indentação.
 */
interface RawSkill {
  Id:        string
  Name:      string
  MaxLevel:  number
  Type?:     string
  Element?:  string
  Description?: string
}

function parseSkillDb(yaml: string): RawSkill[] {
  const skills: RawSkill[] = []
  // Cada skill começa com "  - Id: NNNN"
  const blocks = yaml.split(/\n(?=\s{2}-\s+Id:)/)

  for (const block of blocks) {
    const idMatch       = block.match(/^\s*-?\s*Id:\s*(\d+)/m)
    const nameMatch     = block.match(/^\s+Name:\s+['"]?([^'"\n]+)['"]?/m)
    const aegisMatch    = block.match(/^\s+AegisName:\s+['"]?([\w]+)['"]?/m)
    const maxLvlMatch   = block.match(/^\s+MaxLevel:\s+(\d+)/m)
    const typeMatch     = block.match(/^\s+Type:\s+([\w]+)/m)
    const elementMatch  = block.match(/^\s+Element:\s+Ele_(\w+)/m)
    const descMatch     = block.match(/^\s+Description:\s+['"]?([^'"\n]+)/m)

    if (!idMatch || !aegisMatch) continue

    skills.push({
      Id:          aegisMatch[1],           // usa AegisName como ID (ex: "SM_BASH")
      Name:        nameMatch?.[1]?.trim() ?? aegisMatch[1],
      MaxLevel:    maxLvlMatch  ? parseInt(maxLvlMatch[1])  : 1,
      Type:        typeMatch?.[1],
      Element:     elementMatch?.[1]?.toLowerCase(),
      Description: descMatch?.[1]?.trim(),
    })
  }

  return skills
}

function resolveJobId(skillId: string): string | null {
  for (const [pattern, jobId] of SKILL_PREFIX_TO_JOB) {
    if (pattern.test(skillId)) return jobId
  }
  return null
}

function resolveType(raw?: string): 'active' | 'passive' | 'toggle' {
  if (!raw) return 'active'
  return TYPE_MAP[raw] ?? 'active'
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔧  seed-skills.ts')
  console.log(`   Modo  : ${DRY_RUN ? 'DRY RUN' : 'PRODUÇÃO'}`)
  if (isFinite(LIMIT)) console.log(`   Limite: ${LIMIT} skills`)
  console.log('')

  // 1. Download
  console.log('⬇️   Baixando skill_db.yml do rAthena GitHub...')
  const yaml = await fetchText(SKILL_DB_URL)
  console.log(`   ✔ ${yaml.split('\n').length.toLocaleString()} linhas baixadas.\n`)

  // 2. Parse
  let raw = parseSkillDb(yaml)
  console.log(`📝  ${raw.length.toLocaleString()} skills encontradas no rAthena.`)

  if (isFinite(LIMIT)) raw = raw.slice(0, LIMIT)

  // 3. Enriquecer com job_id
  const skills = raw.map(s => ({
    id:          s.Id,
    name:        s.Name,
    max_level:   s.MaxLevel,
    type:        resolveType(s.Type),
    element:     s.Element ?? null,
    description: s.Description ?? '',
    job_id:      resolveJobId(s.Id),
    requires:    [],
  }))

  // Stats de cobertura
  const withJob    = skills.filter(s => s.job_id).length
  const withoutJob = skills.length - withJob
  const byType     = skills.reduce((acc, s) => { acc[s.type] = (acc[s.type] ?? 0) + 1; return acc }, {} as Record<string, number>)

  console.log(`   Com job_id   : ${withJob}`)
  console.log(`   Sem job_id   : ${withoutJob} (shared/misc skills)`)
  console.log(`   Tipos: ${Object.entries(byType).map(([k,v]) => `${k}=${v}`).join(' | ')}\n`)

  if (DRY_RUN) {
    console.log('💡 Dry run — primeiras 10 skills:')
    skills.slice(0, 10).forEach(s =>
      console.log(`  [${s.type.padEnd(7)}] ${s.id.padEnd(25)} lv${s.max_level} job=${s.job_id ?? 'n/a'}`)
    )
    console.log('\n💡 Nada foi gravado.')
    return
  }

  // 4. Reset opcional
  if (RESET) {
    console.log('🗑️  Removendo skills existentes...')
    const { error } = await supabase.from('skills').delete().neq('id', '__never__')
    if (error) console.error('   Erro no reset:', error.message)
    else console.log('   ✔ Removidas.\n')
  }

  // 5. Upsert em batches de 200
  const BATCH = 200
  let inserted = 0
  let skipped  = 0
  const errors: string[] = []

  for (let i = 0; i < skills.length; i += BATCH) {
    const batch = skills.slice(i, i + BATCH)

    // Skills com job_id devem ter FK válida — filtramos as que não têm
    // (job_id null é ok, FK só restringe valores não-nulos)
    const { error } = await supabase
      .from('skills')
      .upsert(batch, { onConflict: 'id' })

    if (error) {
      // Se o batch falhou, tenta um por um para isolar o erro
      for (const skill of batch) {
        const { error: e2 } = await supabase
          .from('skills')
          .upsert(skill, { onConflict: 'id' })
        if (e2) {
          errors.push(`${skill.id}: ${e2.message}`)
          skipped++
        } else {
          inserted++
        }
      }
    } else {
      inserted += batch.length
    }

    const pct = Math.round(((i + batch.length) / skills.length) * 100)
    process.stdout.write(`\r  Inserindo... ${pct}% (${Math.min(i + BATCH, skills.length)}/${skills.length})`)
  }

  console.log(`\n\n${'─'.repeat(55)}`)
  console.log('📊  RELATÓRIO FINAL')
  console.log('─'.repeat(55))
  console.log(`  Inseridas    : ${inserted}`)
  console.log(`  Ignoradas    : ${skipped}`)
  console.log(`  Erros        : ${errors.length}`)

  if (errors.length > 0 && errors.length <= 20) {
    console.log('\n⚠️  Primeiros erros:')
    errors.slice(0, 20).forEach(e => console.log('  ', e))
  }

  if (errors.length === 0 || inserted > 0) {
    console.log(`\n✅  skills populado com sucesso!`)
    console.log(`   Próximo passo:`)
    console.log(`   POST /api/embed  (gerar embeddings dos itens)`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

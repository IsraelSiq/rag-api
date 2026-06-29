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
 *   --no-job    Inclui skills sem job_id (shared/misc) — requer coluna nullable
 */

import { createClient } from '@supabase/supabase-js'
import * as https from 'https'

const SUPABASE_URL         = process.env.SUPABASE_URL         ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente')
  process.exit(1)
}

const args      = process.argv.slice(2)
const DRY_RUN   = args.includes('--dry-run')
const RESET     = args.includes('--reset')
const INCL_NULL = args.includes('--no-job')   // [Mudança 1] inclui skills sem job_id
const LIMIT     = (() => {
  const l = args.find(a => a.startsWith('--limit='))
  return l ? parseInt(l.split('=')[1]) : Infinity
})()

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const SKILL_DB_URL = 'https://raw.githubusercontent.com/rathena/rathena/master/db/re/skill_db.yml'

// ──────────────────────────────────────────────────────────────────
// Formato real do skill_db.yml:
//
// Body:
//   - Id: 1
//     Name: NV_BASIC          <-- este é o AegisName
//     Description: Basic Skill
//     MaxLevel: 9
//     Type: Weapon            <-- opcional
//
// "Name" é o AegisName (ex: SM_BASH). "Description" é o display name.
// ──────────────────────────────────────────────────────────────────

const SKILL_PREFIX_TO_JOB: Array<[RegExp, string]> = [
  [/^NV_/i,    'novice'],
  [/^SM_/i,    'swordman'],
  [/^MG_/i,    'mage'],
  [/^AL_/i,    'acolyte'],
  [/^MC_/i,    'merchant'],
  [/^TF_/i,    'thief'],
  [/^HT_/i,    'hunter'],
  [/^BA_/i,    'bard'],
  [/^DC_/i,    'dancer'],
  [/^KN_/i,    'knight'],
  [/^CR_/i,    'crusader'],
  [/^WZ_/i,    'wizard'],
  [/^SA_/i,    'sage'],
  [/^PR_/i,    'priest'],
  [/^MO_/i,    'monk'],
  [/^BS_/i,    'blacksmith'],
  [/^AM_/i,    'alchemist'],
  [/^AS_/i,    'assassin'],
  [/^RG_/i,    'rogue'],
  [/^LK_/i,    'lord_knight'],
  [/^PA_/i,    'paladin'],
  [/^HW_/i,    'high_wizard'],
  [/^PF_/i,    'professor'],
  [/^SN_/i,    'sniper'],
  [/^CG_/i,    'clown'],
  [/^HP_/i,    'high_priest'],
  [/^CH_/i,    'champion'],
  [/^WS_/i,    'mastersmith'],
  [/^SG_/i,    'star_gladiator'],
  [/^SL_/i,    'soul_linker'],
  [/^ST_/i,    'stalker'],
  [/^RK_/i,    'rune_knight'],
  [/^WL_/i,    'warlock'],
  [/^SO_/i,    'sorcerer'],
  [/^GS_/i,    'gunslinger'],
  [/^RA_/i,    'ranger'],
  [/^MI_/i,    'minstrel'],
  [/^WA_/i,    'wanderer'],
  [/^AB_/i,    'arch_bishop'],
  [/^SR_/i,    'sura'],
  [/^NC_/i,    'mechanic'],
  [/^GN_/i,    'genetic'],
  [/^GC_/i,    'guillotine_cross'],
  [/^SC_/i,    'shadow_chaser'],
  [/^NJ_/i,    'ninja'],
  [/^KO_/i,    'kagerou'],
  [/^OB_/i,    'oboro'],
  [/^RL_/i,    'rebellion'],
  [/^SX_/i,    'star_emperor'],
  [/^SP_/i,    'soul_reaper'],
  [/^DK_/i,    'dragon_knight'],
  [/^EM_/i,    'elemental_master'],
  [/^WH_/i,    'wind_hawk'],
  [/^TR_/i,    'troubadour'],
  [/^TV_/i,    'trouvere'],
  [/^IQ_/i,    'inquisitor'],
  [/^IG_/i,    'imperial_guard'],
  [/^BO_/i,    'biolo'],
  [/^NW_/i,    'night_watch'],
  [/^SHR_/i,   'shinkiro'],
  [/^SHI_/i,   'shiranui'],
  // AC_ ao final para não conflitar com outros prefixos
  [/^AC_/i,    'archer'],
]

const TYPE_MAP: Record<string, 'active' | 'passive' | 'toggle'> = {
  Passive:  'passive',
  Active:   'active',
  Toggle:   'toggle',
  Magic:    'active',
  Weapon:   'active',
  Misc:     'active',
  Ground:   'active',
  Support:  'active',
  Neutral:  'active',
}

// ── Helpers ────────────────────────────────────────────────────────

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject)
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

interface RawSkill {
  aegisName: string
  humanName: string
  maxLevel:  number
  type?:     string
  element?:  string
}

function parseSkillDb(yaml: string): RawSkill[] {
  const bodyStart = yaml.indexOf('\nBody:')
  if (bodyStart === -1) {
    console.error('  Parser: não encontrou "Body:" no YAML!')
    return []
  }
  const body    = yaml.slice(bodyStart)
  const skills: RawSkill[] = []
  const entries = body.split(/(?=^  - Id:)/m).slice(1)

  for (const entry of entries) {
    const nameMatch    = entry.match(/^    Name:\s+(\S+)/m)
    const descMatch    = entry.match(/^    Description:\s+(.+)$/m)
    const levelMatch   = entry.match(/^    MaxLevel:\s+(\d+)/m)
    const typeMatch    = entry.match(/^    Type:\s+(\w+)/m)
    const elementMatch = entry.match(/^    Element:\s+(\w+)$/m)

    if (!nameMatch) continue

    skills.push({
      aegisName: nameMatch[1].trim(),
      humanName: descMatch?.[1]?.trim() ?? nameMatch[1].trim(),
      maxLevel:  levelMatch ? parseInt(levelMatch[1]) : 1,
      type:      typeMatch?.[1],
      element:   elementMatch?.[1]?.toLowerCase(),
    })
  }

  return skills
}

function resolveJobId(aegisName: string): string | null {
  for (const [pattern, jobId] of SKILL_PREFIX_TO_JOB) {
    if (pattern.test(aegisName)) return jobId
  }
  return null
}

function resolveType(raw?: string): 'active' | 'passive' | 'toggle' {
  if (!raw) return 'passive'
  return TYPE_MAP[raw] ?? 'active'
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧  seed-skills.ts')
  console.log(`   Modo  : ${DRY_RUN ? 'DRY RUN' : 'PRODUÇÃO'}`)
  if (INCL_NULL) console.log('   +     : incluindo skills sem job_id (--no-job)')
  if (isFinite(LIMIT)) console.log(`   Limite: ${LIMIT} skills`)
  console.log('')

  console.log('⬇️   Baixando skill_db.yml do rAthena GitHub...')
  const yaml = await fetchText(SKILL_DB_URL)
  console.log(`   ✔ ${yaml.split('\n').length.toLocaleString()} linhas baixadas.\n`)

  const allRaw = parseSkillDb(yaml)
  console.log(`📝  ${allRaw.length.toLocaleString()} skills encontradas no rAthena.`)

  if (allRaw.length === 0) {
    console.error('   ❌ Nenhuma skill parseada. Verifique o formato do YAML.')
    process.exit(1)
  }

  // ── [Mudança 2] Monta objetos omitindo job_id quando null ──────────
  // Enviar `job_id: null` explicitamente viola FK/NOT NULL no Supabase.
  // Quando null, simplesmente não incluímos o campo no objeto.
  // Use --no-job para inserir também as skills sem job_id
  // (requer que a coluna seja nullable no banco).
  // ───────────────────────────────────────────────────────────────────
  type SkillRow = {
    id:          string
    name:        string
    max_level:   number
    type:        'active' | 'passive' | 'toggle'
    element:     string | null
    description: string
    requires:    unknown[]
    job_id?:     string   // opcional — campo omitido quando null
  }

  const allSkills: SkillRow[] = allRaw.map(s => {
    const jobId = resolveJobId(s.aegisName)
    const row: SkillRow = {
      id:          s.aegisName,
      name:        s.humanName,
      max_level:   s.maxLevel,
      type:        resolveType(s.type),
      element:     s.element ?? null,
      description: s.humanName,
      requires:    [],
    }
    if (jobId !== null) row.job_id = jobId   // só inclui se tiver valor
    return row
  })

  const withJob    = allSkills.filter(s => s.job_id !== undefined).length
  const withoutJob = allSkills.length - withJob
  const byType     = allSkills.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log(`   Com job_id   : ${withJob}`)
  console.log(`   Sem job_id   : ${withoutJob} (shared/misc — ${INCL_NULL ? 'serão inseridas' : 'ignoradas; use --no-job'})`)
  console.log(`   Tipos: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' | ')}\n`)

  // Decide quais inserir
  let skills = INCL_NULL ? allSkills : allSkills.filter(s => s.job_id !== undefined)
  if (isFinite(LIMIT)) skills = skills.slice(0, LIMIT)

  console.log(`📌  ${skills.length} skills serão processadas.\n`)

  if (DRY_RUN) {
    console.log('💡 Dry run — primeiras 15 skills que seriam inseridas:')
    skills.slice(0, 15).forEach(s =>
      console.log(`  [${s.type.padEnd(7)}] ${s.id.padEnd(28)} "${s.name}" lv${s.max_level} job=${s.job_id ?? 'n/a'}`)
    )
    console.log('\n💡 Nada foi gravado.')
    return
  }

  if (RESET) {
    console.log('🗑️  Removendo skills existentes...')
    const { error } = await supabase.from('skills').delete().neq('id', '__never__')
    if (error) console.error('   Erro no reset:', error.message)
    else console.log('   ✔ Removidas.\n')
  }

  const BATCH    = 200
  let inserted   = 0
  let skipped    = 0
  const errors: string[] = []
  let firstError: string | null = null   // [Mudança 3] captura primeiro erro

  for (let i = 0; i < skills.length; i += BATCH) {
    const batch = skills.slice(i, i + BATCH)

    const { error } = await supabase
      .from('skills')
      .upsert(batch, { onConflict: 'id' })

    if (error) {
      if (!firstError) firstError = error.message   // [Mudança 3] registra

      // Tenta skill por skill para isolar o problema
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

  // [Mudança 3] Exibe diagnóstico de erros
  if (firstError) {
    console.log(`\n⚠️  Primeiro erro (diagnóstico):`)
    console.log(`   ${firstError}`)
  }

  if (errors.length > 0) {
    const sample = errors.slice(0, 5)
    console.log(`\n   Amostra de erros (${sample.length}/${errors.length}):`)
    sample.forEach(e => console.log('   ', e))
    if (errors.length > 5) console.log(`   ... e mais ${errors.length - 5} erros.`)
  }

  if (inserted > 0) {
    console.log(`\n✅  ${inserted} skills inseridas com sucesso!`)
    console.log(`   Próximo passo:`)
    console.log(`   POST /api/embed  (gerar embeddings dos itens)`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\n💥  Erro fatal:', err)
  process.exit(1)
})

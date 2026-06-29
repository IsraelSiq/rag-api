// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

const CACHE_TTL_DAYS = 7

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
      body: JSON.stringify({
        model: 'embed-multilingual-v3.0',
        texts: [text],
        input_type: 'search_query',
        embedding_types: ['float'],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.embeddings.float[0]
  } catch { return null }
}

async function generateAnswer(systemPrompt: string, userPrompt: string): Promise<{ text: string; tokens: object }> {
  const res = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
    body: JSON.stringify({
      model: 'command-r-plus',
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cohere chat error: ${err}`)
  }

  const json = await res.json()
  const text = json.message?.content?.[0]?.text ?? json.text ?? ''
  const tokens = json.usage ?? {}
  return { text, tokens }
}

/**
 * Formata os bonuses de um item em texto legivel para o LLM.
 * - value numerico: "stat +X"
 * - value null (condicional): usa a description completa
 */
function formatBonuses(bonuses: any[]): string {
  return bonuses.map(b => {
    if (b.value === null) {
      // Bonus condicional: description tem toda a informacao
      return `  • [condicional] ${b.description}`
    }
    const sign = b.value >= 0 ? '+' : ''
    return `  • ${b.stat} ${sign}${b.value}${ b.condition === 'complex' ? ' (condicional)' : '' }`
  }).join('\n')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })

  const { job, goal, lang = 'pt' } = req.body ?? {}

  if (!job || !goal) {
    return res.status(400).json({ error: '"job" e "goal" são obrigatórios.' })
  }

  if (!process.env.COHERE_API_KEY) {
    return res.status(500).json({ error: 'COHERE_API_KEY não configurada.' })
  }

  try {
    const supabase = getSupabase()
    const cacheKey = `${job}::${goal}::${lang}`.toLowerCase()
    const cutoff   = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString()

    // 1. Checar cache
    const { data: cached } = await supabase
      .from('advisor_cache')
      .select('response, created_at')
      .eq('cache_key', cacheKey)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      return res.status(200).json({ ...cached.response, cached: true })
    }

    // 2. Buscar contexto via RAG
    const embedding = await getEmbedding(`${job} ${goal}`)

    let skills: any[] = []
    let items: any[]  = []

    if (embedding) {
      const [sRes, iRes] = await Promise.all([
        supabase.rpc('match_skills', {
          query_embedding: embedding,
          match_count: 15,
          match_threshold: 0.25,
          filter_job_id: null,
        }),
        supabase.rpc('match_items', {
          query_embedding: embedding,
          match_count: 15,
          match_threshold: 0.25,
        }),
      ])
      skills = sRes.data ?? []
      items  = iRes.data ?? []
    } else {
      // Fallback sem embedding
      const [sRes, iRes] = await Promise.all([
        supabase.from('skills').select('id, name, type, description, job_id').ilike('job_id', `%${job}%`).limit(15),
        supabase.from('items').select('id, name, description').limit(15),
      ])
      skills = sRes.data ?? []
      items  = iRes.data ?? []
    }

    // 3. Buscar item_bonuses dos itens encontrados
    const itemIds = items.map(i => String(i.id))
    let bonusesByItem: Record<string, any[]> = {}

    if (itemIds.length > 0) {
      const { data: bonusRows } = await supabase
        .from('item_bonuses')
        .select('item_id, stat, value, condition, description')
        .in('item_id', itemIds)

      if (bonusRows) {
        for (const row of bonusRows) {
          const key = String(row.item_id)
          if (!bonusesByItem[key]) bonusesByItem[key] = []
          bonusesByItem[key].push(row)
        }
      }
    }

    // 4. Montar prompts
    const skillsCtx = skills.map(s =>
      `- ${s.name} (${s.type ?? ''}, job: ${s.job_id ?? '?'}): ${(s.description ?? '').slice(0, 120)}`
    ).join('\n')

    const itemsCtx = items.map(i => {
      const id      = String(i.id)
      const bonuses = bonusesByItem[id] ?? []
      const bonusTxt = bonuses.length > 0
        ? `\n${formatBonuses(bonuses)}`
        : ''
      return `- ${i.name}: ${(i.description ?? '').slice(0, 120)}${bonusTxt}`
    }).join('\n')

    const systemPrompt = `Você é um especialista em builds de Ragnarok Online (versão Renewal/kRO).
Responda sempre em ${lang === 'pt' ? 'português do Brasil' : 'English'}.
Baseie-se nos dados fornecidos. Seja direto, prático e específico.
Os equipamentos listados incluem seus bônus reais (scrapeados do Divine Pride).
Bônus marcados como [condicional] dependem de refino, stats ou condições especiais — leve em conta ao recomendar.
Estrutura da resposta:
1. Resumo da build (1-2 frases)
2. Skills recomendadas (com níveis sugeridos e motivo)
3. Equipamentos recomendados (com motivo e bônus relevantes)
4. Distribuição de atributos (STR/AGI/VIT/INT/DEX/LUK)
5. Dicas finais`

    const userPrompt = `Job: ${job}\nObjetivo: ${goal}\n\nSkills disponíveis no contexto:\n${skillsCtx || 'Nenhuma encontrada.'}\n\nEquipamentos disponíveis no contexto (com bônus):\n${itemsCtx || 'Nenhum encontrado.'}`

    // 5. Gerar resposta com Cohere Command R+
    const { text: answer, tokens } = await generateAnswer(systemPrompt, userPrompt)

    const response = {
      job, goal, lang,
      answer,
      context: {
        skills_used: skills.length,
        items_used:  items.length,
        bonuses_used: Object.values(bonusesByItem).flat().length,
      },
      usage: tokens,
      cached: false,
    }

    // 6. Salvar no cache
    await supabase.from('advisor_cache').insert({
      cache_key: cacheKey,
      job,
      goal,
      lang,
      response,
    } as any)

    return res.status(200).json(response)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

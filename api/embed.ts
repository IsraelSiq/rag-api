// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embed-multilingual-v3.0',
      texts: [text],
      input_type: 'search_document',
      embedding_types: ['float'],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cohere error: ${err}`)
  }
  const json = await res.json()
  return json.embeddings.float[0]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const secret = process.env.SEED_SECRET
  const provided = req.headers['x-seed-secret']
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  if (!process.env.COHERE_API_KEY) {
    return res.status(500).json({ error: 'COHERE_API_KEY not configured.' })
  }

  try {
    const supabase = getSupabase()

    const { data: skills, error } = await supabase
      .from('skills')
      .select('id, name, description')
      .is('embedding', null)

    if (error) return res.status(500).json({ error: error.message })
    if (!skills || skills.length === 0) {
      return res.status(200).json({ ok: true, message: 'All skills already have embeddings.' })
    }

    let updated = 0
    const errors: string[] = []

    for (const skill of skills) {
      try {
        const text = `${skill.name}: ${skill.description}`
        const embedding = await getEmbedding(text)

        const { error: updateError } = await supabase
          .from('skills')
          .update({ embedding } as any)
          .eq('id', skill.id)

        if (updateError) {
          errors.push(`${skill.id}: ${updateError.message}`)
        } else {
          updated++
        }
      } catch (e: unknown) {
        errors.push(`${skill.id}: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Embeddings gerados: ${updated}/${skills.length}`,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

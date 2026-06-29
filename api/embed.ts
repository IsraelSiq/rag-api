// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

const BATCH_SIZE = 96 // Cohere supports up to 96 texts per call

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embed-multilingual-v3.0',
      texts,
      input_type: 'search_document',
      embedding_types: ['float'],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cohere error: ${err}`)
  }
  const json = await res.json()
  return json.embeddings.float
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
      .order('id')
      .limit(BATCH_SIZE)

    if (error) return res.status(500).json({ error: error.message })
    if (!skills || skills.length === 0) {
      return res.status(200).json({ ok: true, done: true, message: 'Todos os embeddings já foram gerados!' })
    }

    // Build texts array and call Cohere once for all
    const texts = skills.map(s => `${s.name}: ${s.description}`)
    const embeddings = await getEmbeddings(texts)

    // Update each skill with its embedding
    let updated = 0
    const errors: string[] = []

    for (let i = 0; i < skills.length; i++) {
      const { error: updateError } = await supabase
        .from('skills')
        .update({ embedding: embeddings[i] } as any)
        .eq('id', skills[i].id)

      if (updateError) {
        errors.push(`${skills[i].id}: ${updateError.message}`)
      } else {
        updated++
      }
    }

    const { count } = await supabase
      .from('skills')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)

    return res.status(200).json({
      ok: true,
      done: (count ?? 0) === 0,
      embedded: updated,
      remaining: count ?? 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `Batch: ${updated}/${skills.length} embeddings gerados. Restando: ${count ?? 0}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from '../lib/supabase'
import { cors, handleOptions } from '../lib/helpers'

const BATCH_SIZE = 96

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

  // ?table=items  ou  ?table=skills (default)
  const table = ((req.query.table as string) ?? 'skills') === 'items' ? 'items' : 'skills'

  try {
    const supabase = getSupabase()

    if (table === 'skills') {
      const { data: rows, error } = await supabase
        .from('skills')
        .select('id, name, description')
        .is('embedding', null)
        .order('id')
        .limit(BATCH_SIZE)

      if (error) return res.status(500).json({ error: error.message })
      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, done: true, table, message: 'Todos os embeddings de skills já foram gerados!' })
      }

      const texts = rows.map(s => `${s.name}: ${s.description ?? ''}`)
      const embeddings = await getEmbeddings(texts)

      let updated = 0
      const errors: string[] = []
      for (let i = 0; i < rows.length; i++) {
        const { error: e } = await supabase.from('skills').update({ embedding: embeddings[i] } as any).eq('id', rows[i].id)
        if (e) errors.push(`${rows[i].id}: ${e.message}`)
        else updated++
      }

      const { count } = await supabase.from('skills').select('id', { count: 'exact', head: true }).is('embedding', null)
      return res.status(200).json({
        ok: true, done: (count ?? 0) === 0, table, embedded: updated,
        remaining: count ?? 0, errors: errors.length ? errors : undefined,
      })
    }

    // table === 'items'
    const { data: rows, error } = await supabase
      .from('items')
      .select('id, name, description, raw_bonus')
      .is('embedding', null)
      .order('id')
      .limit(BATCH_SIZE)

    if (error) return res.status(500).json({ error: error.message })
    if (!rows || rows.length === 0) {
      return res.status(200).json({ ok: true, done: true, table, message: 'Todos os embeddings de items já foram gerados!' })
    }

    const texts = rows.map(r => [
      r.name,
      r.description ?? '',
      r.raw_bonus ? `bônus: ${r.raw_bonus}` : '',
    ].filter(Boolean).join('. '))

    const embeddings = await getEmbeddings(texts)

    let updated = 0
    const errors: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const { error: e } = await supabase.from('items').update({ embedding: embeddings[i] } as any).eq('id', rows[i].id)
      if (e) errors.push(`${rows[i].id}: ${e.message}`)
      else updated++
    }

    const { count } = await supabase.from('items').select('id', { count: 'exact', head: true }).is('embedding', null)
    return res.status(200).json({
      ok: true, done: (count ?? 0) === 0, table, embedded: updated,
      remaining: count ?? 0, errors: errors.length ? errors : undefined,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      `Missing env vars — SUPABASE_URL: ${url ? 'ok' : 'MISSING'}, SUPABASE_ANON_KEY: ${key ? 'ok' : 'MISSING'}`
    )
  }
  _client = createClient(url, key, {
    global: { fetch: fetch.bind(globalThis) },
    realtime: {
      transport: class DummyWS {
        constructor() { /* noop */ }
        close() { /* noop */ }
      } as unknown as typeof WebSocket,
    },
  })
  return _client
}

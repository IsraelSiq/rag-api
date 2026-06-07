import { createClient } from '@supabase/supabase-js'

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type MatchSkillsRow = {
  id: string
  name: string
  type: 'active' | 'passive' | 'toggle'
  element: string | null
  max_level: number
  description: string
  job_id: string
  requires: Json
  similarity: number
}

export type Database = {
  public: {
    Tables: {
      skills: {
        Row: {
          id: string
          name: string
          type: 'active' | 'passive' | 'toggle'
          element: string | null
          max_level: number
          description: string
          job_id: string
          requires: Json
          fts: unknown
          embedding: unknown
        }
        Insert: {
          id: string
          name: string
          type: 'active' | 'passive' | 'toggle'
          element?: string | null
          max_level: number
          description: string
          job_id: string
          requires?: Json
          embedding?: unknown
        }
        Update: {
          id?: string
          name?: string
          type?: 'active' | 'passive' | 'toggle'
          element?: string | null
          max_level?: number
          description?: string
          job_id?: string
          requires?: Json
          embedding?: unknown
        }
      }
      jobs: {
        Row: {
          id: string
          name: string
          tier: number
          parent_id: string | null
          skill_points: number
          icon: string | null
          expanded: boolean
        }
        Insert: {
          id: string
          name: string
          tier: number
          parent_id?: string | null
          skill_points: number
          icon?: string | null
          expanded?: boolean
        }
        Update: {
          id?: string
          name?: string
          tier?: number
          parent_id?: string | null
          skill_points?: number
          icon?: string | null
          expanded?: boolean
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      match_skills: {
        Args: {
          query_embedding: number[]
          match_count: number
          match_threshold?: number
          filter_job_id?: string | null
        }
        Returns: MatchSkillsRow[]
      }
    }
    Enums: Record<string, never>
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = ReturnType<typeof createClient<Database>>

let _client: SupabaseClientType | null = null

export function getSupabase(): SupabaseClientType {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      `Missing env vars — SUPABASE_URL: ${url ? 'ok' : 'MISSING'}, key: ${key ? 'ok' : 'MISSING'}`
    )
  }
  _client = createClient<Database>(url, key)
  return _client
}

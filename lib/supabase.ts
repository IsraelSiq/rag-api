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
          job_id?: string
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
      items: {
        Row: {
          id: string
          name: string
          type: number | null
          sub_type: number | null
          slots: number
          weight: number | null
          description: string | null
          raw_bonus: string | null
          dp_data: Json | null
          source: string | null
          created_at: string | null
          embedding: unknown
        }
        Insert: {
          id: string
          name: string
          type?: number | null
          sub_type?: number | null
          slots?: number
          weight?: number | null
          description?: string | null
          raw_bonus?: string | null
          dp_data?: Json | null
          source?: string | null
          embedding?: unknown
        }
        Update: {
          id?: string
          name?: string
          type?: number | null
          sub_type?: number | null
          slots?: number
          weight?: number | null
          description?: string | null
          raw_bonus?: string | null
          dp_data?: Json | null
          source?: string | null
          embedding?: unknown
        }
      }
      item_bonuses: {
        Row: {
          id: number
          item_id: string
          stat: string
          value: number
          condition: string
          job_id: string | null
          skill_mod: string | null
          is_card: boolean | null
        }
        Insert: {
          item_id: string
          stat: string
          value: number
          condition: string
          job_id?: string | null
          skill_mod?: string | null
          is_card?: boolean | null
        }
        Update: {
          item_id?: string
          stat?: string
          value?: number
          condition?: string
          job_id?: string | null
          skill_mod?: string | null
          is_card?: boolean | null
        }
      }
      item_skill_mods: {
        Row: {
          id: number
          item_id: string
          skill_id: string
          mod_type: string
          mod_value: number
        }
        Insert: {
          item_id: string
          skill_id: string
          mod_type: string
          mod_value: number
        }
        Update: {
          item_id?: string
          skill_id?: string
          mod_type?: string
          mod_value?: number
        }
      }
      item_combos: {
        Row: {
          id: number
          name: string
          item_ids: string[]
          bonus_stat: string | null
          bonus_value: number | null
          description: string | null
        }
        Insert: {
          name: string
          item_ids: string[]
          bonus_stat?: string | null
          bonus_value?: number | null
          description?: string | null
        }
        Update: {
          name?: string
          item_ids?: string[]
          bonus_stat?: string | null
          bonus_value?: number | null
          description?: string | null
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
      match_items: {
        Args: {
          query_embedding: number[]
          match_count: number
          match_threshold?: number
        }
        Returns: {
          id: string
          name: string
          description: string | null
          similarity: number
        }[]
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

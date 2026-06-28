-- ============================================================
-- DDL: tabelas do sistema de itens, bônus e advisor
-- Aplicar via Supabase Dashboard ou migration
-- ============================================================

-- Colunas adicionais em items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS raw_bonus     TEXT,
  ADD COLUMN IF NOT EXISTS source        TEXT DEFAULT 'divine_pride',
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- Bônus granulares por item
CREATE TABLE IF NOT EXISTS public.item_bonuses (
  id          BIGSERIAL PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  stat        TEXT NOT NULL,
  value       INT  NOT NULL,
  condition   TEXT NOT NULL DEFAULT 'always',
  job_id      TEXT REFERENCES public.jobs(id),
  skill_mod   TEXT,
  is_card     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_bonuses_item_id ON public.item_bonuses(item_id);
CREATE INDEX IF NOT EXISTS idx_item_bonuses_stat    ON public.item_bonuses(stat);
CREATE INDEX IF NOT EXISTS idx_item_bonuses_value   ON public.item_bonuses(stat, value DESC);

-- Set bonuses
CREATE TABLE IF NOT EXISTS public.item_combos (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT,
  item_ids    TEXT[] NOT NULL,
  bonus_stat  TEXT,
  bonus_value INT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_combos_item_ids ON public.item_combos USING GIN(item_ids);

-- Modificações de skill por item
CREATE TABLE IF NOT EXISTS public.item_skill_mods (
  id          BIGSERIAL PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  skill_id    TEXT REFERENCES public.skills(id),
  mod_type    TEXT NOT NULL,
  mod_value   INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_skill_mods_item  ON public.item_skill_mods(item_id);
CREATE INDEX IF NOT EXISTS idx_item_skill_mods_skill ON public.item_skill_mods(skill_id);

-- Slots de equipamento por job
CREATE TABLE IF NOT EXISTS public.job_equip_slots (
  job_id        TEXT NOT NULL REFERENCES public.jobs(id),
  slot          TEXT NOT NULL,
  allowed_types TEXT[],
  PRIMARY KEY (job_id, slot)
);

-- Cache do advisor
CREATE TABLE IF NOT EXISTS public.advisor_cache (
  id          BIGSERIAL PRIMARY KEY,
  job_id      TEXT NOT NULL,
  goal_hash   TEXT NOT NULL,
  goal_text   TEXT,
  response    JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, goal_hash)
);

CREATE INDEX IF NOT EXISTS idx_advisor_cache_lookup  ON public.advisor_cache(job_id, goal_hash);
CREATE INDEX IF NOT EXISTS idx_advisor_cache_created ON public.advisor_cache(created_at);

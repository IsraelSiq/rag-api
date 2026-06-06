-- ============================================================
-- 1. Habilitar pgvector (rodar uma vez no Supabase SQL Editor)
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- 2. Adicionar coluna embedding na tabela skills (se não existe)
-- ============================================================
alter table skills
  add column if not exists embedding vector(1536);

-- ============================================================
-- 3. Índice HNSW para busca por cosine similarity
-- ============================================================
create index if not exists skills_embedding_hnsw_idx
  on skills
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ============================================================
-- 4. Função RPC: match_skills
--    Chamada de: supabase.rpc('match_skills', { ... })
-- ============================================================
create or replace function match_skills(
  query_embedding  vector(1536),
  match_count      int     default 10,
  match_threshold  float   default 0.3,
  filter_job_id    text    default null
)
returns table (
  id          text,
  name        text,
  type        text,
  element     text,
  max_level   int,
  description text,
  job_id      text,
  requires    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    s.id,
    s.name,
    s.type,
    s.element,
    s.max_level,
    s.description,
    s.job_id,
    s.requires,
    1 - (s.embedding <=> query_embedding) as similarity
  from skills s
  where
    s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
    and (filter_job_id is null or s.job_id = filter_job_id)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- 5. Permissão para a role anônima chamar a função
-- ============================================================
grant execute on function match_skills to anon, authenticated;

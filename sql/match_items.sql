-- ============================================================
-- RPC: match_items — busca semântica de itens via pgvector
-- Espelha a função match_skills já existente
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_items(
  query_embedding  vector(1536),
  match_count      int     DEFAULT 10,
  match_threshold  float   DEFAULT 0.3,
  filter_type      text    DEFAULT NULL,
  filter_job_id    text    DEFAULT NULL
)
RETURNS TABLE (
  id          text,
  name        text,
  type        smallint,
  sub_type    smallint,
  slots       smallint,
  description text,
  raw_bonus   text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    i.id,
    i.name,
    i.type,
    i.sub_type,
    i.slots,
    i.description,
    i.raw_bonus,
    1 - (i.embedding <=> query_embedding) AS similarity
  FROM public.items i
  WHERE
    i.embedding IS NOT NULL
    AND (filter_type   IS NULL OR i.type::text = filter_type)
    AND 1 - (i.embedding <=> query_embedding) > match_threshold
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$$;

# rag-api — RO Build Advisor

> REST API do **TRUEMMO** — simulador e advisor de builds de Ragnarok Online.  
> Ingere dados de itens, skills e classes das fontes externas (Divine Pride, iRO Wiki), armazena no Supabase com embeddings vetoriais e usa IA (GPT-4o) para sugerir a build ideal por personagem e objetivo.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Vercel Serverless Functions (Node 20) |
| Banco | Supabase — PostgreSQL + pgvector |
| IA | OpenAI — `text-embedding-3-small` + `gpt-4o` |
| Validação | Zod |
| Linguagem | TypeScript |

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│               FONTES EXTERNAS                            │
│   Divine Pride API  ·  iRO Wiki (MediaWiki API)          │
└─────────────┬──────────────────────────────┬─────────────┘
              │  ETL / Ingestão              │
┌─────────────▼──────────────────────────────▼─────────────┐
│                  SUPABASE (PostgreSQL)                     │
│                                                            │
│  jobs · skills · items · item_bonuses                     │
│  item_combos · item_skill_mods · job_equip_slots          │
│  embeddings (pgvector) · FTS index                        │
└──────────────────────┬───────────────────────────────────┘
                       │  Vercel Serverless
        ┌──────────────┼──────────────────────┐
        ▼              ▼                       ▼
   /api/jobs      /api/search            /api/advisor
   /api/skills    /api/embed             (GPT-4o RAG)
   /api/items     /api/ingest
```

---

## Estrutura do Projeto

```
api/
  health.ts              → GET  /api/health
  jobs.ts                → GET  /api/jobs       POST /api/jobs
  jobs/[id].ts           → GET /PUT /DELETE     /api/jobs/:id
  skills.ts              → GET  /api/skills      POST /api/skills
  skills/[id].ts         → GET /PUT /DELETE     /api/skills/:id
  search.ts              → GET  /api/search      (semântico + FTS + sinônimos)
  embed.ts               → POST /api/embed       (gera embeddings)
  seed.ts                → POST /api/seed        (seed inicial de dados)
  docs.ts                → GET  /api/docs        (documentação interativa)
  swagger.ts             → GET  /api/swagger     (spec OpenAPI)
  ── A IMPLEMENTAR ──
  items.ts               → GET  /api/items
  items/[id].ts          → GET /api/items/:id
  ingest/divine-pride.ts → POST /api/ingest/divine-pride
  ingest/irowiki.ts      → POST /api/ingest/irowiki
  ingest/parse-bonuses.ts→ POST /api/ingest/parse-bonuses
  advisor.ts             → POST /api/advisor

lib/
  supabase.ts            → cliente Supabase + tipos Database
  schemas.ts             → schemas Zod
  helpers.ts             → cors, handleOptions
  ── A IMPLEMENTAR ──
  bonus-parser.ts        → parser de ItemScript/EquipScript (Athena format)
  divine-pride.ts        → cliente HTTP Divine Pride API
  irowiki.ts             → cliente MediaWiki API (iRO Wiki)

scripts/
sql/
  match_skills.sql       → função RPC pgvector para busca semântica de skills
  ── A IMPLEMENTAR ──
  schema_items.sql       → DDL das tabelas de itens e bônus
  match_items.sql        → função RPC para busca semântica de itens
```

---

## Banco de Dados — Schema

### Tabelas existentes

| Tabela | Descrição |
|--------|-----------|
| `jobs` | Classes/jobs (tier, parent, skill_points, expanded) |
| `skills` | Skills com embedding + FTS (id, name, type, element, max_level, job_id, requires) |

### Tabelas planejadas

| Tabela | Descrição |
|--------|-----------|
| `items` | Equipamentos e cartas (id, name, type, subtype, slots, weight, raw_bonus, embedding) |
| `item_bonuses` | Bônus granulares por item (stat, value, condition, job_id, skill_mod) |
| `item_combos` | Set bonuses (item_ids[], bonus_stat, bonus_value) |
| `item_skill_mods` | Modificações de skill por item (level_up, damage_boost, cast_time) |
| `job_equip_slots` | Slots de equipamento por job (head_top/mid/low, armor, weapon…) |

---

## Endpoints

### Existentes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status da API |
| GET | `/api/jobs` | Listar classes (`?tier=2&expanded=false`) |
| GET | `/api/jobs/:id` | Buscar job por ID |
| POST | `/api/jobs` | Criar job |
| PUT | `/api/jobs/:id` | Atualizar job |
| DELETE | `/api/jobs/:id` | Remover job |
| GET | `/api/skills` | Listar skills (`?job_id=swordman&type=active`) |
| GET | `/api/skills/:id` | Buscar skill por ID |
| POST | `/api/skills` | Criar skill |
| PUT | `/api/skills/:id` | Atualizar skill |
| DELETE | `/api/skills/:id` | Remover skill |
| GET | `/api/search` | Busca semântica + FTS + sinônimos (`?q=cura&job_id=priest`) |
| POST | `/api/embed` | Gerar/atualizar embeddings |
| GET | `/api/docs` | Documentação interativa |

### Planejados

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/items` | Listar itens (`?stat=str&min=3&job=knight&type=weapon`) |
| GET | `/api/items/:id` | Item completo com bônus e combos |
| POST | `/api/ingest/divine-pride` | Ingere itens da Divine Pride API |
| POST | `/api/ingest/irowiki` | Ingere dados complementares do iRO Wiki |
| POST | `/api/ingest/parse-bonuses` | Parseia ItemScript → `item_bonuses` |
| POST | `/api/advisor` | Sugere build ideal via GPT-4o RAG |

---

## Roadmap

### ✅ Fase 0 — Base (Concluída)
- CRUD de jobs e skills
- Busca semântica com pgvector (`match_skills`)
- Busca por FTS + sinônimos em PT-BR
- Estrutura Vercel Serverless + Supabase + Zod + TypeScript

### 🔄 Fase 1 — Ingestão de Itens (Em andamento)
- [ ] Schema SQL: `items`, `item_bonuses`, `item_combos`, `item_skill_mods`, `job_equip_slots`
- [ ] `lib/divine-pride.ts` — cliente para a Divine Pride API
- [ ] `lib/bonus-parser.ts` — parser de ItemScript/EquipScript (formato Athena)
- [ ] `POST /api/ingest/divine-pride` — pipeline completo de ingestão
- [ ] `GET /api/items` com filtros por stat, job, tipo

### 📋 Fase 2 — Build Advisor (Próxima)
- [ ] `POST /api/ingest/parse-bonuses` — normaliza bônus para SQL granular
- [ ] `sql/match_items.sql` — RPC de busca semântica de itens
- [ ] `POST /api/embed` estendido para itens
- [ ] `POST /api/advisor` — GPT-4o RAG com contexto de itens e skills
- [ ] System prompt especializado em builds de RO

### 🔮 Fase 3 — Otimizações
- [ ] Cron semanal de atualização (GitHub Actions ou Vercel Cron)
- [ ] Cache de sugestões por job+objetivo
- [ ] Suporte a combos/sets no advisor
- [ ] Endpoint `/api/advisor/compare` — compara duas builds

---

## Variáveis de Ambiente

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
OPENAI_API_KEY=<openai_key>
DIVINE_PRIDE_API_KEY=<divine_pride_key>
```

> A `DIVINE_PRIDE_API_KEY` é gratuita em [divine-pride.net](https://www.divine-pride.net).

---

## Dev Local

```bash
npm install
cp .env.example .env   # preencha as variáveis
npx vercel dev
```

---

## Fontes de Dados

| Fonte | Uso | Acesso |
|-------|-----|--------|
| [Divine Pride](https://www.divine-pride.net/api) | Itens, skills, monstros (dados primários) | API Key gratuita |
| [iRO Wiki](https://irowiki.org/api.php) | Descrições expandidas, sets, combos | MediaWiki API pública |

---

## Contribuindo

1. Abra uma issue descrevendo a feature ou bug
2. Crie uma branch `feat/<nome>` ou `fix/<nome>`
3. Submeta um Pull Request referenciando a issue

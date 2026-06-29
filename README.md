# rag-api — RO Build Advisor

> REST API do **TRUEMMO** — simulador e advisor de builds de Ragnarok Online.  
> Armazena jobs e skills no Supabase com embeddings vetoriais (pgvector) e usa IA (GPT-4o) para sugerir a build ideal por personagem e objetivo.

🔗 **Produção:** [https://rag-api-ochre.vercel.app](https://rag-api-ochre.vercel.app)  
📖 **Docs interativos:** [https://rag-api-ochre.vercel.app/api/docs](https://rag-api-ochre.vercel.app/api/docs)

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | Vercel Serverless Functions (Node 22) |
| Banco | Supabase — PostgreSQL + pgvector |
| IA | OpenAI — `text-embedding-3-small` + `gpt-4o` |
| Validação | Zod |
| Linguagem | TypeScript |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│               FONTES EXTERNAS (Planejado)               │
│   Divine Pride API  ·  iRO Wiki (MediaWiki API)         │
└─────────────┬───────────────────────────────────────────┘
              │  ETL / Ingestão
┌─────────────▼───────────────────────────────────────────┐
│                  SUPABASE (PostgreSQL)                  │
│                                                         │
│  jobs · skills                                          │
│  embeddings (pgvector) · FTS index                      │
└──────────────────────┬──────────────────────────────────┘
                       │  Vercel Serverless
        ┌──────────────┼───────────────────┐
        ▼              ▼                   ▼
   /api/jobs      /api/search        /api/embed
   /api/skills    /api/seed          /api/docs
```

---

## Estrutura do Projeto

```
api/
  health.ts          → GET  /api/health
  jobs.ts            → GET  /api/jobs        POST /api/jobs
  jobs/[id].ts       → GET /PUT /DELETE      /api/jobs/:id
  skills.ts          → GET  /api/skills      POST /api/skills
  skills/[id].ts     → GET /PUT /DELETE      /api/skills/:id
  search.ts          → GET  /api/search      (semântico + FTS + sinônimos)
  embed.ts           → POST /api/embed       (gera embeddings em lotes)
  seed.ts            → POST /api/seed        (seed inicial de dados)
  docs.ts            → GET  /api/docs        (Swagger UI interativo)
                       GET  /api/docs?json=1 (OpenAPI spec JSON)
                       GET  /api/swagger     (alias → /api/docs)

lib/
  supabase.ts        → cliente Supabase + tipos Database
  schemas.ts         → schemas Zod
  helpers.ts         → cors, handleOptions

scripts/
sql/
  match_skills.sql   → função RPC pgvector para busca semântica
```

> ⚠️ Vercel Free permite no máximo **12 Serverless Functions**.  
> O projeto usa exatamente 12 — não criar novos arquivos em `api/` sem remover outro.

---

## Banco de Dados — Schema

### Tabelas existentes

| Tabela | Descrição |
|--------|-----------|
| `jobs` | Classes/jobs (id, name, tier, parent_id, skill_points, expanded, icon, embedding) |
| `skills` | Skills (id, name, type, element, max_level, job_id, requires, description, embedding) |

### Funções RPC (pgvector)

| Função | Uso |
|--------|-----|
| `match_skills` | Busca semântica por embedding de skills |

### Tabelas planejadas (Fase 1)

| Tabela | Descrição |
|--------|-----------|
| `items` | Equipamentos e cartas (id, name, type, slots, weight, raw_bonus, embedding) |
| `item_bonuses` | Bônus granulares por item (stat, value, condition, job_id) |
| `item_combos` | Set bonuses (item_ids[], bonus_stat, bonus_value) |
| `job_equip_slots` | Slots de equipamento por job |

---

## Endpoints

### Ativos em Produção

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
| POST | `/api/embed` | Gerar/atualizar embeddings (lotes de 20) |
| POST | `/api/seed` | Seed inicial de jobs e skills (`x-seed-secret` header) |
| GET | `/api/docs` | Swagger UI interativo |
| GET | `/api/docs?json=1` | OpenAPI spec JSON |
| GET | `/api/swagger` | Alias para `/api/docs` |

### Planejados (Fase 1 / 2)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/items` | Listar itens (`?stat=str&job=knight&type=weapon`) |
| GET | `/api/items/:id` | Item completo com bônus e combos |
| POST | `/api/ingest/divine-pride` | Ingere itens da Divine Pride API |
| POST | `/api/advisor` | Sugere build ideal via GPT-4o RAG |

---

## `/api/embed` — Como funciona

O endpoint processa embeddings em lotes para não exceder o timeout do Vercel (10s).

```bash
# Chamar repetidamente até { "done": true }
curl -X POST https://rag-api-ochre.vercel.app/api/embed \
  -H "x-seed-secret: <SEED_SECRET>"
```

Resposta enquanto ainda há pendências:
```json
{ "ok": true, "done": false, "embedded": 20, "remaining": 45 }
```

Resposta quando completo:
```json
{ "ok": true, "done": true, "embedded": 65, "remaining": 0 }
```

---

## Variáveis de Ambiente

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
OPENAI_API_KEY=<openai_key>
SEED_SECRET=<segredo_para_seed_e_embed>
```

Configure no Vercel em **Project Settings → Environment Variables**.

---

## Dev Local

```bash
npm install
cp .env.example .env   # preencha as variáveis
npx vercel dev --local-config vercel.local.json
```

### Seed + Embeddings local

```bash
# 1. Seed de dados
curl -X POST http://localhost:3000/api/seed -H "x-seed-secret: local123"

# 2. Gerar embeddings (repetir até done: true)
curl -X POST http://localhost:3000/api/embed -H "x-seed-secret: local123"
```

---

## Roadmap

### ✅ Fase 0 — Base (Concluída)
- CRUD de jobs e skills
- Busca semântica com pgvector (`match_skills`)
- Busca FTS + sinônimos em PT-BR
- Embeddings em lote com controle de timeout
- Swagger UI integrado em `docs.ts`
- Deploy Vercel + Supabase + Zod + TypeScript

### 🔄 Fase 1 — Ingestão de Itens
- [ ] Schema SQL: `items`, `item_bonuses`, `item_combos`, `job_equip_slots`
- [ ] `lib/divine-pride.ts` — cliente Divine Pride API
- [ ] `lib/bonus-parser.ts` — parser ItemScript/EquipScript (formato Athena)
- [ ] `GET /api/items` com filtros por stat, job, tipo

### 📋 Fase 2 — Build Advisor
- [ ] `sql/match_items.sql` — RPC busca semântica de itens
- [ ] `POST /api/embed` estendido para itens
- [ ] `POST /api/advisor` — GPT-4o RAG com contexto de itens + skills
- [ ] System prompt especializado em builds de RO

### 🔮 Fase 3 — Otimizações
- [ ] Cron semanal (GitHub Actions ou Vercel Cron)
- [ ] Cache de sugestões por job+objetivo
- [ ] Endpoint `/api/advisor/compare` — compara duas builds

---

## Fontes de Dados (Planejado)

| Fonte | Uso | Acesso |
|-------|-----|--------|
| [Divine Pride](https://www.divine-pride.net/api) | Itens, skills, monstros | API Key gratuita |
| [iRO Wiki](https://irowiki.org/api.php) | Descrições expandidas, sets, combos | MediaWiki API pública |

---

## Contribuindo

1. Abra uma issue descrevendo a feature ou bug
2. Crie uma branch `feat/<nome>` ou `fix/<nome>`
3. Submeta um Pull Request referenciando a issue

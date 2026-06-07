# rag-api

REST API para o **Ragnarok Online Skill Simulator (TRUEMMO)**.

## Stack

- **Runtime**: Vercel Serverless Functions (Node 20)
- **Banco**: Supabase (PostgreSQL + pgvector)
- **Validação**: Zod
- **Linguagem**: TypeScript

## Estrutura

```
api/
  jobs.ts          → GET /api/jobs, POST /api/jobs
  jobs/[id].ts     → GET/PUT/DELETE /api/jobs/:id
  skills.ts        → GET /api/skills, POST /api/skills
  skills/[id].ts   → GET/PUT/DELETE /api/skills/:id
lib/
  supabase.ts      → cliente Supabase + tipos
  schemas.ts       → schemas Zod
  helpers.ts       → cors, handleOptions
```

## Variáveis de Ambiente

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
```

## Endpoints

### Jobs
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/jobs` | Listar classes (`?tier=2&expanded=false`) |
| GET | `/api/jobs/:id` | Buscar por ID |
| POST | `/api/jobs` | Criar classe |
| PUT | `/api/jobs/:id` | Atualizar classe |
| DELETE | `/api/jobs/:id` | Remover classe |

### Skills
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/skills` | Listar skills (`?job_id=swordman&type=active`) |
| GET | `/api/skills/:id` | Buscar por ID |
| POST | `/api/skills` | Criar skill |
| PUT | `/api/skills/:id` | Atualizar skill |
| DELETE | `/api/skills/:id` | Remover skill |

## Dev local

```bash
npm install
npx vercel dev
```

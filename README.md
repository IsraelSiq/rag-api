# rag-api

REST API para o **Ragnarok Online Skill Simulator** — CRUD completo de classes e skills.

## Stack

- **Vercel Functions** (serverless, TypeScript)
- **Supabase** (PostgreSQL)
- **Zod** — validação de schemas
- **Swagger UI** — documentação interativa

## Endpoints

| Method | Path | Descrição |
|---|---|---|
| GET | /api/jobs | Listar classes (`?tier=` `?expanded=`) |
| GET | /api/jobs/:id | Buscar classe |
| POST | /api/jobs | Criar classe |
| PUT | /api/jobs/:id | Atualizar classe |
| DELETE | /api/jobs/:id | Remover classe |
| GET | /api/skills | Listar skills (`?job_id=` `?type=`) |
| GET | /api/skills/:id | Buscar skill |
| POST | /api/skills | Criar skill |
| PUT | /api/skills/:id | Atualizar skill |
| DELETE | /api/skills/:id | Remover skill |
| GET | /api/docs | OpenAPI spec (JSON) |
| GET | /api/swagger | Swagger UI |

## Deploy no Vercel

1. Importe o repo em [vercel.com/new](https://vercel.com/new)
2. Adicione as variáveis de ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Deploy automático ✅

## Dev local

```bash
npm install
cp .env.example .env   # preencha as chaves do Supabase
npm run dev            # inicia em http://localhost:3000
```

# rag-api

REST API para o **Ragnarok Online Skill Simulator** — CRUD completo de classes e skills com Swagger UI.

## Stack

- **Fastify** — servidor HTTP
- **@fastify/swagger** + **@fastify/swagger-ui** — documentação interativa
- **Supabase** (PostgreSQL) — banco de dados
- **Zod** — validação de schemas
- **TypeScript**

## Setup

```bash
npm install
cp .env.example .env   # preencha SUPABASE_URL e SUPABASE_ANON_KEY
npm run dev
```

Abra http://localhost:3333/docs para ver o Swagger UI.

## Endpoints

### Jobs
| Method | Path | Descrição |
|---|---|---|
| GET | /jobs | Listar todas as classes |
| GET | /jobs/:id | Buscar classe por ID |
| POST | /jobs | Criar nova classe |
| PUT | /jobs/:id | Atualizar classe |
| DELETE | /jobs/:id | Remover classe |

### Skills
| Method | Path | Descrição |
|---|---|---|
| GET | /skills | Listar todas as skills (query: `?job_id=`) |
| GET | /skills/:id | Buscar skill por ID |
| POST | /skills | Criar nova skill |
| PUT | /skills/:id | Atualizar skill |
| DELETE | /skills/:id | Remover skill |

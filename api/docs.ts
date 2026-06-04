import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cors } from '../lib/helpers'

const spec = {
  openapi: '3.0.0',
  info: { title: 'RO Skill Simulator API', version: '2.0.0', description: 'CRUD de classes e skills do Ragnarok Online' },
  tags: [
    { name: 'Jobs', description: 'Operações com classes' },
    { name: 'Skills', description: 'Operações com skills' },
  ],
  paths: {
    '/api/jobs': {
      get: { tags: ['Jobs'], summary: 'Listar classes', parameters: [{ name: 'tier', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } }, { name: 'expanded', in: 'query', schema: { type: 'boolean' } }], responses: { '200': { description: 'Lista de classes' } } },
      post: { tags: ['Jobs'], summary: 'Criar classe', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JobCreate' } } } }, responses: { '201': { description: 'Classe criada' }, '400': { description: 'Dados inválidos' }, '409': { description: 'ID já existe' } } },
    },
    '/api/jobs/{id}': {
      get: { tags: ['Jobs'], summary: 'Buscar classe', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Classe encontrada' }, '404': { description: 'Não encontrada' } } },
      put: { tags: ['Jobs'], summary: 'Atualizar classe', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JobUpdate' } } } }, responses: { '200': { description: 'Atualizada' }, '404': { description: 'Não encontrada' } } },
      delete: { tags: ['Jobs'], summary: 'Remover classe', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Removida' }, '404': { description: 'Não encontrada' } } },
    },
    '/api/skills': {
      get: { tags: ['Skills'], summary: 'Listar skills', parameters: [{ name: 'job_id', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string', enum: ['active', 'passive', 'toggle'] } }], responses: { '200': { description: 'Lista de skills' } } },
      post: { tags: ['Skills'], summary: 'Criar skill', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillCreate' } } } }, responses: { '201': { description: 'Skill criada' }, '400': { description: 'Dados inválidos' }, '409': { description: 'ID já existe' } } },
    },
    '/api/skills/{id}': {
      get: { tags: ['Skills'], summary: 'Buscar skill', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Skill encontrada' }, '404': { description: 'Não encontrada' } } },
      put: { tags: ['Skills'], summary: 'Atualizar skill', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillUpdate' } } } }, responses: { '200': { description: 'Atualizada' }, '404': { description: 'Não encontrada' } } },
      delete: { tags: ['Skills'], summary: 'Remover skill', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Removida' }, '404': { description: 'Não encontrada' } } },
    },
  },
  components: {
    schemas: {
      JobCreate: { type: 'object', required: ['id', 'name', 'tier', 'skill_points'], properties: { id: { type: 'string' }, name: { type: 'string' }, tier: { type: 'integer', minimum: 1, maximum: 5 }, parent_id: { type: 'string', nullable: true }, skill_points: { type: 'integer', minimum: 0 }, icon: { type: 'string', nullable: true }, expanded: { type: 'boolean', default: false } } },
      JobUpdate: { type: 'object', properties: { name: { type: 'string' }, tier: { type: 'integer', minimum: 1, maximum: 5 }, parent_id: { type: 'string', nullable: true }, skill_points: { type: 'integer', minimum: 0 }, icon: { type: 'string', nullable: true }, expanded: { type: 'boolean' } } },
      SkillCreate: { type: 'object', required: ['id', 'job_id', 'name', 'max_level', 'type'], properties: { id: { type: 'string' }, job_id: { type: 'string' }, name: { type: 'string' }, max_level: { type: 'integer', minimum: 1, maximum: 20 }, type: { type: 'string', enum: ['active', 'passive', 'toggle'] }, element: { type: 'string', nullable: true }, description: { type: 'string' }, requires: { type: 'array', items: { type: 'object', properties: { skillId: { type: 'string' }, level: { type: 'integer' } } } } } },
      SkillUpdate: { type: 'object', properties: { job_id: { type: 'string' }, name: { type: 'string' }, max_level: { type: 'integer', minimum: 1, maximum: 20 }, type: { type: 'string', enum: ['active', 'passive', 'toggle'] }, element: { type: 'string', nullable: true }, description: { type: 'string' }, requires: { type: 'array', items: { type: 'object', properties: { skillId: { type: 'string' }, level: { type: 'integer' } } } } } },
    },
  },
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  cors(res)
  return res.status(200).json(spec)
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jobRoutes } from './routes/jobs'
import { skillRoutes } from './routes/skills'

const app = Fastify({ logger: true })

async function bootstrap() {
  // CORS
  await app.register(cors, { origin: '*' })

  // Swagger spec
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'RO Skill Simulator API',
        description: 'CRUD de classes e skills do Ragnarok Online',
        version: '1.0.0',
      },
      tags: [
        { name: 'Jobs', description: 'Operações com classes' },
        { name: 'Skills', description: 'Operações com skills' },
      ],
    },
  })

  // Swagger UI
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  // Routes
  await app.register(jobRoutes)
  await app.register(skillRoutes)

  // Health check
  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))

  const port = Number(process.env.PORT ?? 3333)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`\n🚀 API rodando em http://localhost:${port}`)
  console.log(`📖 Swagger UI em http://localhost:${port}/docs\n`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})

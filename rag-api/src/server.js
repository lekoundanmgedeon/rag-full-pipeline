/**
 * rag-api — Serveur unifié
 *
 * Fusionne rag-ingestion (port 3000) + rag-engine (port 3001)
 * en un seul processus Express sur le port 3000.
 *
 * Routes :
 *   POST   /api/upload
 *   GET    /api/documents
 *   GET    /api/documents/:id
 *   GET    /api/documents/:id/status    (SSE)
 *   DELETE /api/documents/:id
 *   POST   /api/documents/:id/reindex
 *
 *   POST   /api/chat                    (SSE streaming)
 *   GET    /api/conversations
 *   GET    /api/conversations/:id
 *   DELETE /api/conversations/:id
 *   POST   /api/messages/:id/feedback
 *
 *   POST   /api/search
 *   GET    /api/stats
 *   GET    /health
 */

import 'dotenv/config'
import express   from 'express'
import helmet    from 'helmet'
import cors      from 'cors'

import { checkDbConnection }         from './config/database.js'
import { redis }                     from './config/redis.js'
import { OllamaEmbeddingService }    from './services/EmbeddingService.js'
import { OllamaLLMService }          from './services/LLMService.js'
import { logger }                    from './utils/logger.js'

import uploadRoutes  from './routes/upload.js'
import chatRoutes    from './routes/chat.js'
import searchRoutes  from './routes/search.js'

const app  = express()
const PORT = parseInt(process.env.PORT || '3000')

// ── Sécurité ─────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: true, limit: '256kb' }))

// ── Routes ───────────────────────────────────────────────────────
app.use('/api', uploadRoutes)
app.use('/api', chatRoutes)
app.use('/api', searchRoutes)

// ── Health ───────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = {}

  try   { await checkDbConnection(); checks.db = 'ok' }
  catch (e) { checks.db = `error: ${e.message}` }

  try   { await redis.ping(); checks.redis = 'ok' }
  catch (e) { checks.redis = `error: ${e.message}` }

  try {
    const h = await new OllamaEmbeddingService().healthCheck()
    checks.ollama_embed = h.ok ? 'ok' : h.message
  } catch (e) { checks.ollama_embed = `error: ${e.message}` }

  try {
    const h = await new OllamaLLMService().healthCheck()
    checks.ollama_llm = h.ok ? 'ok' : h.message
  } catch (e) { checks.ollama_llm = `error: ${e.message}` }

  const allOk = Object.values(checks).every(v => v === 'ok')
  res.status(allOk ? 200 : 503).json({
    status:    allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  })
})

// ── Error handler ────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path })
  res.status(500).json({
    error:   'Erreur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// ── Démarrage ────────────────────────────────────────────────────
async function start() {
  try {
    const v = await checkDbConnection()
    logger.info(`PostgreSQL: ${v.split(' ').slice(0, 2).join(' ')}`)
  } catch (err) {
    logger.error('Cannot connect to PostgreSQL', { error: err.message })
    process.exit(1)
  }

  try {
    await redis.connect()
    logger.info('Redis connected')
  } catch (err) {
    logger.warn('Redis unavailable (cache + queue disabled)', { error: err.message })
  }

  const embedHealth = await new OllamaEmbeddingService().healthCheck()
  const llmHealth   = await new OllamaLLMService().healthCheck()

  if (!embedHealth.ok) logger.warn(`Ollama embed: ${embedHealth.message}`)
  else                 logger.info(`Ollama embed: ${embedHealth.target}`)

  if (!llmHealth.ok)   logger.warn(`Ollama LLM: ${llmHealth.message}`)
  else                 logger.info(`Ollama LLM: ${llmHealth.target}`)

  app.listen(PORT, () => {
    logger.info(`🚀 RAG API (unified) on http://localhost:${PORT}`)
    logger.info(`   Embed : ${process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'}`)
    logger.info(`   LLM   : ${process.env.OLLAMA_LLM_MODEL  || 'qwen3:8b'}`)
  })
}

start().catch(err => {
  logger.error('Startup failed', { error: err.message })
  process.exit(1)
})

export default app

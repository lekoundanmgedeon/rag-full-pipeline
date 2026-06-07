/**
 * Serveur Express — Moteur RAG
 * Chat API avec streaming SSE + recherche documentaire
 */

import 'dotenv/config';
import express  from 'express';
import helmet   from 'helmet';
import cors     from 'cors';
import { checkDbConnection } from './config/database.js';
import { redis }             from './config/redis.js';
import { OllamaLLMService }  from './services/LLMService.js';
import chatRoutes            from './routes/chat.js';
import searchRoutes          from './routes/search.js';
import { logger }            from './utils/logger.js';

const app  = express();
const PORT = parseInt(process.env.PORT || '3001');

// ── Sécurité ─────────────────────────────────────────────────────
app.use(helmet({
  // SSE nécessite de désactiver certains headers helmet
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  methods:     ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '256kb' }));

// ── Routes ───────────────────────────────────────────────────────
app.use('/api', chatRoutes);
app.use('/api', searchRoutes);

// ── Health ───────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = {};
  try { await checkDbConnection(); checks.db = 'ok'; }
  catch (e) { checks.db = `error: ${e.message}`; }

  try { await redis.ping(); checks.redis = 'ok'; }
  catch (e) { checks.redis = `error: ${e.message}`; }

  try {
    const llm    = new OllamaLLMService();
    const health = await llm.healthCheck();
    checks.ollama_llm = health.ok ? 'ok' : health.message;
  } catch (e) { checks.ollama_llm = `error: ${e.message}`; }

  const allOk = Object.values(checks).every(v => v === 'ok');
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ── Error handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Erreur interne' });
});

// ── Démarrage ────────────────────────────────────────────────────
async function start() {
  try {
    await checkDbConnection();
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.error('Cannot connect to PostgreSQL', { error: err.message });
    process.exit(1);
  }

  try {
    await redis.connect();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable (no embedding cache)', { error: err.message });
  }

  const llm    = new OllamaLLMService();
  const health = await llm.healthCheck();
  if (!health.ok) {
    logger.warn(`Ollama LLM: ${health.message}`);
    logger.warn(`Run: ollama pull ${process.env.OLLAMA_LLM_MODEL || 'qwen3:8b'}`);
  } else {
    logger.info(`Ollama LLM ready: ${health.target}`);
  }

  app.listen(PORT, () => {
    logger.info(`🧠 RAG Engine running on http://localhost:${PORT}`);
    logger.info(`   LLM model   : ${process.env.OLLAMA_LLM_MODEL  || 'qwen3:8b'}`);
    logger.info(`   Embed model : ${process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'}`);
  });
}

start().catch(err => {
  logger.error('Startup failed', { error: err.message });
  process.exit(1);
});

export default app;

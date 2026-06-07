/**
 * EmbeddingService — version consolidée
 *
 * Fusionne les deux versions précédentes :
 *   - rag-ingestion : batch complet, indexDocument(), retry
 *   - rag-engine    : embed() simple avec cache Redis
 *
 * Cette version unique expose les deux usages.
 */

import axios  from 'axios'
import crypto from 'crypto'
import { logger, logIngestion } from '../utils/logger.js'
import 'dotenv/config'

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL    || 'http://localhost:11434'
const MODEL        = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const BATCH_SIZE   = parseInt(process.env.EMBEDDING_BATCH_SIZE || '20')
const MAX_RETRIES  = parseInt(process.env.MAX_RETRIES || '3')

export class OllamaEmbeddingService {
  constructor(redis = null) {
    this.redis    = redis
    this.model    = MODEL
    this.cacheTTL = 3600
    this._client  = axios.create({ baseURL: OLLAMA_BASE, timeout: 60_000 })
  }

  // ── Embed un texte unique (avec cache Redis) ─────────────────
  async embed(text) {
    const key = this._cacheKey(text)
    if (this.redis) {
      const cached = await this._fromCache(key)
      if (cached) return cached
    }
    const [embedding] = await this._embedBatchWithRetry([text])
    if (this.redis) await this._toCache(key, embedding)
    return embedding
  }

  // ── Embed plusieurs textes en batches ────────────────────────
  async embedMany(texts) {
    if (!texts.length) return []
    const { uncached, cachedMap } = await this._splitCached(texts)
    const batches = this._toBatches(uncached, BATCH_SIZE)
    const fresh   = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const embeddings = await this._embedBatchWithRetry(batch.map(t => t.text))
      embeddings.forEach((emb, j) => {
        fresh.push({ key: batch[j].key, emb })
        if (this.redis) this._toCache(batch[j].key, emb).catch(() => {})
      })
      if (i < batches.length - 1) await this._sleep(100)
    }

    let fi = 0
    return texts.map(text => {
      const key = this._cacheKey(text)
      return cachedMap.has(key) ? cachedMap.get(key) : fresh[fi++]?.emb
    })
  }

  // ── Indexer tous les chunks d'un document ────────────────────
  async indexDocument(documentId, db, onProgress = null) {
    const startMs = Date.now()
    const { rows: chunks } = await db.query(
      `SELECT id, content FROM document_chunks
       WHERE document_id = $1 AND embedding IS NULL
       ORDER BY chunk_index`,
      [documentId]
    )

    if (!chunks.length) {
      logIngestion(documentId, 'No chunks to embed')
      return { embedded: 0, skipped: 0 }
    }

    logIngestion(documentId, 'Starting embedding', { total: chunks.length })
    const batches = this._toBatches(chunks.map(c => ({ key: c.id, text: c.content })), BATCH_SIZE)
    let embedded = 0

    for (let i = 0; i < batches.length; i++) {
      const batch      = batches[i]
      const embeddings = await this._embedBatchWithRetry(batch.map(b => b.text))

      await db.query(
        `UPDATE document_chunks AS dc
         SET embedding = v.emb::vector
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS emb) AS v
         WHERE dc.id = v.id`,
        [
          batch.map(b => b.key),
          embeddings.map(e => '[' + e.join(',') + ']'),
        ]
      )

      embedded += batch.length
      onProgress?.(Math.round((embedded / chunks.length) * 100))
      logIngestion(documentId, 'Embedding progress', { embedded, total: chunks.length })
    }

    await db.query(
      `UPDATE documents SET status='indexed', indexed_at=NOW(), chunk_count=$1 WHERE id=$2`,
      [chunks.length, documentId]
    )

    logIngestion(documentId, 'Embedding complete', { embedded, ms: Date.now() - startMs })
    return { embedded, totalMs: Date.now() - startMs }
  }

  // ── Health check ─────────────────────────────────────────────
  async healthCheck() {
    try {
      const { data } = await this._client.get('/api/tags')
      const models   = data.models?.map(m => m.name) || []
      const ok       = models.some(m => m.startsWith(this.model.split(':')[0]))
      return {
        ok,
        models,
        target:  this.model,
        message: ok ? `Model ${this.model} available`
                    : `Model ${this.model} NOT found. Run: ollama pull ${this.model}`,
      }
    } catch (err) {
      return { ok: false, message: `Ollama unreachable: ${err.message}` }
    }
  }

  // ── Privé ────────────────────────────────────────────────────

  async _embedBatch(texts) {
    try {
      const { data } = await this._client.post('/api/embed', { model: this.model, input: texts })
      if (data.embeddings) return data.embeddings
      return [data.embedding]
    } catch {
      return Promise.all(texts.map(t =>
        this._client.post('/api/embeddings', { model: this.model, prompt: t })
          .then(r => r.data.embedding)
      ))
    }
  }

  async _embedBatchWithRetry(texts, attempt = 0) {
    try {
      return await this._embedBatch(texts)
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err
      const delay = Math.pow(2, attempt) * 1000
      logger.warn(`Embedding retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`)
      await this._sleep(delay)
      return this._embedBatchWithRetry(texts, attempt + 1)
    }
  }

  async _splitCached(texts) {
    const cachedMap = new Map()
    const uncached  = []
    if (!this.redis) return { uncached: texts.map(t => ({ key: this._cacheKey(t), text: t })), cachedMap }
    await Promise.all(texts.map(async (text) => {
      const key = this._cacheKey(text)
      const hit = await this._fromCache(key)
      hit ? cachedMap.set(key, hit) : uncached.push({ key, text })
    }))
    return { uncached, cachedMap }
  }

  async _fromCache(key) {
    try { const v = await this.redis.get(key); return v ? JSON.parse(v) : null } catch { return null }
  }

  async _toCache(key, embedding) {
    try { await this.redis.setex(key, this.cacheTTL, JSON.stringify(embedding)) } catch {}
  }

  _cacheKey(text) {
    return `emb:${this.model}:${crypto.createHash('sha256').update(text).digest('hex')}`
  }

  _toBatches(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

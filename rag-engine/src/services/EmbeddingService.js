/**
 * Re-export du service d'embedding depuis le pipeline d'ingestion.
 * Dans un monorepo, ce serait un package partagé @rag/core.
 * Ici on duplique la classe minimale nécessaire au RAG engine.
 */

import axios from 'axios';
import crypto from 'crypto';
import 'dotenv/config';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL   || 'http://localhost:11434';
const MODEL       = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export class OllamaEmbeddingService {
  constructor(redis = null) {
    this.redis   = redis;
    this.model   = MODEL;
    this.cacheTTL = 3600;
    this._client = axios.create({ baseURL: OLLAMA_BASE, timeout: 30_000 });
  }

  async embed(text) {
    const key = `emb:${this.model}:${crypto.createHash('sha256').update(text).digest('hex')}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) return JSON.parse(cached);
      } catch {}
    }

    const response = await this._client.post('/api/embeddings', {
      model: this.model, prompt: text,
    });
    const embedding = response.data.embedding;

    if (this.redis) {
      try { await this.redis.setex(key, this.cacheTTL, JSON.stringify(embedding)); } catch {}
    }

    return embedding;
  }
}

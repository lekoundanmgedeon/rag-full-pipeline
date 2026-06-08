/**
 * OllamaLLMService
 *
 * Abstraction sur Ollama pour :
 *   - Génération streaming (SSE → frontend)
 *   - Génération complète (reformulation, résumé)
 *   - Gestion des erreurs et retries
 *   - Support Qwen3 (thinking mode) et Gemma
 *
 * Modèles recommandés :
 *   qwen3:8b   — raisonnement, contexte long, français correct
 *   qwen3:14b  — meilleure qualité si RAM suffisante
 *   gemma3:9b  — alternative rapide
 *   mistral:7b — très rapide, contexte 32k
 */

/**
 * LLMService — supporte Ollama local ET Mistral API
 * Sélection via LLM_PROVIDER=ollama|mistral dans .env
 */

import axios from 'axios'
import { logger } from '../utils/logger.js'
import 'dotenv/config'

const PROVIDER = process.env.LLM_PROVIDER || 'ollama'

// ── Config Ollama ─────────────────────────────────────────────
const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL  || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_LLM_MODEL || 'gemma3:1b'

// ── Config Mistral ────────────────────────────────────────────
const MISTRAL_BASE  = 'https://api.mistral.ai/v1'
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'
const MISTRAL_KEY   = process.env.MISTRAL_API_KEY

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3')

export class OllamaLLMService {
  constructor() {
    this.provider = PROVIDER
    this.model    = PROVIDER === 'mistral' ? MISTRAL_MODEL : OLLAMA_MODEL

    this._client = axios.create({
      baseURL: PROVIDER === 'mistral' ? MISTRAL_BASE : OLLAMA_BASE,
      timeout: PROVIDER === 'mistral' ? 30_000 : 600_000,
      headers: PROVIDER === 'mistral'
        ? { Authorization: `Bearer ${MISTRAL_KEY}` }
        : {},
    })
  }

  // ── Génération complète (reformulation, résumé) ──────────────
  async complete(prompt, opts = {}) {
    if (this.provider === 'mistral') {
      return this._mistralComplete(prompt, opts)
    }
    return this._ollamaComplete(prompt, opts)
  }

  // ── Streaming ────────────────────────────────────────────────
  async *stream(promptObj, opts = {}) {
    if (this.provider === 'mistral') {
      yield* this._mistralStream(promptObj, opts)
    } else {
      yield* this._ollamaStream(promptObj, opts)
    }
  }

  // ── Mistral : génération complète ────────────────────────────
  async _mistralComplete(prompt, opts = {}) {
    const messages = typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : prompt

    const { data } = await this._client.post('/chat/completions', {
      model:       this.model,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens:  opts.maxTokens   ?? 512,
      stream:      false,
    })

    return data.choices[0].message.content
  }

  // ── Mistral : streaming ──────────────────────────────────────
  async *_mistralStream(promptObj, opts = {}) {
    const { system, messages } = promptObj

    const allMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ]

    const response = await this._client.post('/chat/completions', {
      model:       this.model,
      messages:    allMessages,
      temperature: opts.temperature ?? 0.2,
      max_tokens:  opts.maxTokens   ?? 1024,
      stream:      true,
    }, {
      responseType: 'stream',
    })

    let buffer = ''

    for await (const chunk of response.data) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          const token  = parsed.choices?.[0]?.delta?.content
          if (token) yield token
        } catch {}
      }
    }
  }

  // ── Ollama : génération complète ─────────────────────────────
  async _ollamaComplete(prompt, opts = {}) {
    const payload = {
      model:   OLLAMA_MODEL,
      stream:  false,
      options: {
        temperature:   opts.temperature ?? 0.1,
        num_predict:   opts.maxTokens   ?? 512,
      },
    }

    if (Array.isArray(prompt)) {
      payload.messages = prompt
    } else {
      payload.prompt = prompt
    }

    const endpoint = Array.isArray(prompt) ? '/api/chat' : '/api/generate'
    const { data } = await this._client.post(endpoint, payload)
    return data?.response ?? data?.message?.content ?? ''
  }

  // ── Ollama : streaming ───────────────────────────────────────
  async *_ollamaStream(promptObj, opts = {}) {
    const { system, messages } = promptObj

    const chatMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ]

    const response = await this._client.post('/api/chat', {
      model:    OLLAMA_MODEL,
      messages: chatMessages,
      stream:   true,
      options: {
        temperature:    opts.temperature   ?? 0.2,
        num_predict:    opts.maxTokens     ?? 200,
        num_ctx:        opts.contextWindow ?? 512,
        num_thread:     4,
        repeat_penalty: 1.1,
      },
    }, {
      responseType: 'stream',
    })

    let buffer = ''
    for await (const chunk of response.data) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          const token = this._filterThinking(data.message?.content || '')
          if (token) yield token
          if (data.done) return
        } catch {}
      }
    }
  }

  _filterThinking(token) {
    return token.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/?think>/g, '')
  }

  // ── Health check ─────────────────────────────────────────────
  async healthCheck() {
    if (this.provider === 'mistral') {
    try {
      if (!MISTRAL_KEY) {
        return { ok: false, message: 'MISTRAL_API_KEY manquante dans .env' }
      }
      // Test réel : appel léger sur /models
      const { data } = await this._client.get('/models')
      const models = data.data?.map(m => m.id) || []
      const hasModel = models.includes(this.model)
      return {
        ok: true,
        target: this.model,
        message: hasModel
          ? `Mistral API ready: ${this.model}`
          : `Mistral API ok mais modèle ${this.model} introuvable. Disponibles: ${models.slice(0,3).join(', ')}`,
      }
    } catch (err) {
      return {
        ok: false,
        message: `Mistral API error: ${err.response?.data?.message || err.response?.status || err.message}`,
      }
    }
  }
     // Ollama
    try {
      const { data } = await this._client.get('/api/tags')
      const models   = data.models?.map(m => m.name) || []
      const ok       = models.some(m => m.startsWith(OLLAMA_MODEL.split(':')[0]))
      return {
        ok,
        models,
        target:  OLLAMA_MODEL,
        message: ok ? `Ollama ready: ${OLLAMA_MODEL}` : `Model not found: ${OLLAMA_MODEL}`,
      }
    } catch (err) {
      return { ok: false, message: `Ollama unreachable: ${err.message}` }
    }
  }
}
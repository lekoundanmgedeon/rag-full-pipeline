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

import axios from 'axios';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL  || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_LLM_MODEL || 'qwen3:8b';
const MAX_RETRIES  = parseInt(process.env.MAX_RETRIES || '3');

export class OllamaLLMService {
  constructor() {
    this.model   = DEFAULT_MODEL;
    this.baseUrl = OLLAMA_BASE;
    this._client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120_000,
    });
  }

  // ── Génération complète (non-streaming) ──────────────────────
  /**
   * Pour les appels internes : reformulation, résumé, classification.
   * Retourne le texte complet de la réponse.
   */
  async complete(prompt, opts = {}) {
    const payload = {
      model:  opts.model || this.model,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      messages: Array.isArray(prompt) ? prompt : undefined,
      stream:  false,
      options: {
        temperature:   opts.temperature   ?? 0.1,
        num_predict:   opts.maxTokens     ?? 512,
        top_p:         opts.topP          ?? 0.9,
        repeat_penalty: opts.repeatPenalty ?? 1.1,
        // Qwen3 : désactiver le "thinking" pour les appels internes rapides
        ...(this.model.startsWith('qwen3') ? { think: false } : {}),
      },
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const endpoint = Array.isArray(prompt) ? '/api/chat' : '/api/generate';
        const response = await this._client.post(endpoint, payload);

        // /api/generate → response.response
        // /api/chat     → response.message.content
        return response.data?.response
          ?? response.data?.message?.content
          ?? '';
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        const delay = Math.pow(2, attempt) * 500;
        logger.warn(`LLM complete retry ${attempt + 1} in ${delay}ms`, { error: err.message });
        await this._sleep(delay);
      }
    }
  }

  // ── Génération streaming ──────────────────────────────────────
  /**
   * Retourne un AsyncGenerator qui yield les tokens au fur et à mesure.
   * Utilisé pour le SSE vers le frontend.
   *
   * @param {object} promptObj - { system, messages }
   * @param {object} opts      - { temperature, maxTokens, ... }
   * @yields {string} token de texte
   */
  async *stream(promptObj, opts = {}) {
    const { system, messages } = promptObj;

    // Construire le tableau de messages pour /api/chat
    const chatMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ];

    const payload = {
      model:    opts.model || this.model,
      messages: chatMessages,
      stream:   true,
      options: {
        temperature:    opts.temperature    ?? 0.2,
        num_predict:    opts.maxTokens      ?? 1024,
        num_ctx:        opts.contextWindow  ?? 8192,
        top_p:          opts.topP           ?? 0.9,
        repeat_penalty: opts.repeatPenalty  ?? 1.1,
        // Qwen3 : mode thinking (raisonnement) activé pour les réponses finales
        ...(this.model.startsWith('qwen3') ? { think: opts.think ?? false } : {}),
      },
    };

    const response = await this._client.post('/api/chat', payload, {
      responseType: 'stream',
      timeout: 120_000,
    });

    let buffer = '';

    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // garder le dernier fragment incomplet

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);

          // Qwen3 thinking : ignorer les blocs <think>...</think>
          if (data.message?.content) {
            const token = this._filterThinking(data.message.content);
            if (token) yield token;
          }

          if (data.done) return;

        } catch {
          // Ligne JSON incomplète — ignorée
        }
      }
    }

    // Vider le buffer restant
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.message?.content) {
          const token = this._filterThinking(data.message.content);
          if (token) yield token;
        }
      } catch {}
    }
  }

  // ── Filtre Qwen3 thinking tags ────────────────────────────────
  // Qwen3 peut émettre des balises <think>...</think> dans ses tokens.
  // On les filtre pour n'envoyer que la réponse finale au frontend.
  _filterThinking(token) {
    // Supprimer les blocs <think> complets
    token = token.replace(/<think>[\s\S]*?<\/think>/g, '');
    // Supprimer les ouvertures/fermetures partielles
    token = token.replace(/<\/?think>/g, '');
    return token;
  }

  // ── Health check ─────────────────────────────────────────────
  async healthCheck() {
    try {
      const { data } = await this._client.get('/api/tags');
      const models   = data.models?.map(m => m.name) || [];
      const hasModel = models.some(m => m.startsWith(this.model.split(':')[0]));
      return {
        ok:      hasModel,
        models,
        target:  this.model,
        message: hasModel
          ? `Model ${this.model} available`
          : `Model ${this.model} NOT found. Run: ollama pull ${this.model}`,
      };
    } catch (err) {
      return { ok: false, message: `Ollama unreachable: ${err.message}` };
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

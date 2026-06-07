/**
 * RerankerService
 *
 * Re-ordonne les chunks récupérés par hybrid search
 * en utilisant un scoring plus précis basé sur la co-occurrence
 * question ↔ chunk.
 *
 * Deux stratégies disponibles :
 *   1. LLM Reranker (Ollama) — le plus précis, via un prompt de scoring
 *   2. Keyword Reranker       — rapide, basé sur TF-IDF simplifié
 *
 * En production, on pourrait utiliser un modèle cross-encoder dédié
 * (ex: BAAI/bge-reranker-v2-m3 via une API Python/FastAPI).
 */

import { OllamaLLMService } from './LLMService.js';
import { logger } from '../utils/logger.js';

export class RerankerService {
  constructor(opts = {}) {
    this.strategy  = opts.strategy || 'keyword';  // 'llm' | 'keyword'
    this.llmSvc    = opts.strategy === 'llm' ? new OllamaLLMService() : null;
    this.batchSize = opts.batchSize || 5;           // Pour le LLM reranker
  }

  /**
   * Re-rank une liste de chunks par rapport à une question.
   *
   * @param {string}   question - question utilisateur
   * @param {object[]} chunks   - chunks récupérés par hybrid search
   * @param {number}   topK     - nb de chunks à retourner après re-rank
   * @returns {object[]} chunks re-ordonnés avec rerankScore
   */
  async rerank(question, chunks, topK = 6) {
    if (!chunks.length) return [];

    const startMs = Date.now();
    let reranked;

    if (this.strategy === 'llm') {
      reranked = await this._llmRerank(question, chunks);
    } else {
      reranked = this._keywordRerank(question, chunks);
    }

    // Trier par score décroissant et limiter
    const result = reranked
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);

    logger.debug(`Rerank (${this.strategy}): ${chunks.length} → ${result.length} in ${Date.now() - startMs}ms`);
    return result;
  }

  // ── Stratégie 1 : Keyword Reranker ───────────────────────────
  /**
   * Score chaque chunk selon :
   *   - Présence des mots de la question dans le chunk
   *   - Position des mots (début = plus important)
   *   - Densité des termes (TF simplifié)
   *   - Bonus si le chunk contient une phrase entière de la question
   *
   * Rapide, déterministe, pas d'appel LLM supplémentaire.
   */
  _keywordRerank(question, chunks) {
    const qTerms   = this._tokenize(question);
    const qBigrams = this._bigrams(qTerms);

    return chunks.map(chunk => {
      const text   = chunk.content.toLowerCase();
      const tokens = this._tokenize(chunk.content);

      // Score TF : fraction des termes de la question présents dans le chunk
      const termMatches = qTerms.filter(t => text.includes(t)).length;
      const tfScore     = termMatches / (qTerms.length || 1);

      // Bonus bigrammes (phrases courtes de la question)
      const bigramMatches = qBigrams.filter(bg => text.includes(bg)).length;
      const bigramBonus   = bigramMatches / (qBigrams.length || 1) * 0.3;

      // Bonus position : si les termes apparaissent tôt dans le chunk
      const firstOccurrence = qTerms.reduce((min, term) => {
        const idx = text.indexOf(term);
        return idx !== -1 ? Math.min(min, idx) : min;
      }, text.length);
      const positionBonus = firstOccurrence < 100 ? 0.1 : 0;

      // Score hybride combiné avec le score de retrieval original
      const retrievalScore = chunk.hybrid_score || 0;
      const rerankScore    = retrievalScore * 0.4
                           + tfScore        * 0.4
                           + bigramBonus
                           + positionBonus;

      return { ...chunk, rerankScore };
    });
  }

  // ── Stratégie 2 : LLM Reranker ───────────────────────────────
  /**
   * Demande à Ollama de noter chaque chunk de 0 à 10
   * selon sa pertinence pour répondre à la question.
   * Plus précis mais ~3-5x plus lent.
   */
  async _llmRerank(question, chunks) {
    const scored = [];

    // Traiter par batches pour ne pas surcharger Ollama
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch  = chunks.slice(i, i + this.batchSize);
      const scores = await Promise.all(
        batch.map(chunk => this._scoreChunk(question, chunk))
      );
      batch.forEach((chunk, j) => {
        scored.push({ ...chunk, rerankScore: scores[j] });
      });
    }

    return scored;
  }

  async _scoreChunk(question, chunk) {
    const prompt = `
Tu es un système d'évaluation de pertinence.
Note de 0 à 10 la pertinence de ce passage pour répondre à la question.
Réponds UNIQUEMENT avec un nombre entier entre 0 et 10.

QUESTION: ${question}

PASSAGE: ${chunk.content.slice(0, 500)}

NOTE (0-10):`.trim();

    try {
      const response = await this.llmSvc.complete(prompt, {
        maxTokens:   5,
        temperature: 0,
      });
      const score = parseInt(response.trim());
      return isNaN(score) ? 5 : Math.min(10, Math.max(0, score)) / 10;
    } catch {
      return chunk.hybrid_score || 0.5;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  _tokenize(text) {
    const stopWords = new Set([
      'le','la','les','un','une','des','de','du','et','en','au','aux',
      'est','sont','avec','pour','par','sur','dans','que','qui','qu',
      'je','tu','il','elle','nous','vous','ils','elles','me','se','ce',
      'a','à','ou','où','si','ne','pas','plus','très','aussi','bien',
    ]);
    return text
      .toLowerCase()
      .replace(/[^\wàâäéèêëîïôùûüç\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  _bigrams(tokens) {
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    return bigrams;
  }
}

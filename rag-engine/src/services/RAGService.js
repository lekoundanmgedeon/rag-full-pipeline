/**
 * RAGService — Moteur RAG complet
 *
 * Pipeline :
 *   1. Reformulation de la question (context-aware)
 *   2. Hybrid search (vectoriel + full-text)
 *   3. Re-ranking des chunks
 *   4. Construction du contexte
 *   5. Appel LLM en streaming (Ollama)
 *   6. Persistance asynchrone conversation/messages
 *   7. Post-traitement de la réponse
 */

import { OllamaEmbeddingService } from './EmbeddingService.js';
import { OllamaLLMService }       from './LLMService.js';
import { RerankerService }         from './RerankerService.js';
import { SearchRepository }        from '../repositories/SearchRepository.js';
import { ConversationRepository }  from '../repositories/ConversationRepository.js';
import {
  QUERY_REFINEMENT_PROMPT,
  SUMMARY_PROMPT,
  buildRagPrompt,
} from '../prompts/templates.js';
import { sanitizeResponse } from '../utils/security.js';
import { logger }           from '../utils/logger.js';
import 'dotenv/config';

// Seuil de tokens avant résumé automatique de la conversation
const SUMMARY_TOKEN_THRESHOLD = parseInt(process.env.SUMMARY_TOKEN_THRESHOLD || '6000');

// Nb de messages récents à inclure dans le context window
const HISTORY_WINDOW = parseInt(process.env.HISTORY_WINDOW || '6');

// Taille du pool de candidats avant re-ranking
const CANDIDATE_POOL = parseInt(process.env.CANDIDATE_POOL || '40');

// Nb de chunks envoyés au LLM après re-ranking
const CONTEXT_CHUNKS = parseInt(process.env.CONTEXT_CHUNKS || '6');

export class RAGService {
  constructor(db, redis) {
    this.db          = db;
    this.embedSvc    = new OllamaEmbeddingService(redis);
    this.llmSvc      = new OllamaLLMService();
    this.reranker    = new RerankerService({ strategy: 'keyword' });
    this.searchRepo  = new SearchRepository(db);
    this.convRepo    = new ConversationRepository(db);
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTHODE PRINCIPALE — query()
  // Retourne { stream: AsyncGenerator, sources: [], conversationId }
  // ═══════════════════════════════════════════════════════════════
  async query({
    question,
    userId,
    tenantId,
    conversationId = null,
    filters        = {},
    streamOptions  = {},
  }) {
    const startMs = Date.now();

    // ── 0. Récupérer / créer la conversation ────────────────────
    let conversation;
    if (conversationId) {
      conversation = await this.convRepo.getConversation(conversationId, tenantId);
      if (!conversation) throw new Error('Conversation introuvable');
    } else {
      conversation = await this.convRepo.createConversation({
        tenantId,
        userId,
        title: this._generateTitle(question),
      });
    }

    const convId = conversation.id;

    // ── 1. Historique + résumé ───────────────────────────────────
    const [history, summary] = await Promise.all([
      this.convRepo.getRecentMessages(convId, HISTORY_WINDOW),
      conversation.summary || null,
    ]);

    // ── 2. Reformulation de la question ─────────────────────────
    const refinedQuestion = await this._refineQuestion(question, history, summary);
    logger.debug('Question refined', { original: question, refined: refinedQuestion });

    // ── 3. Embedding de la question reformulée ───────────────────
    const queryEmbedding = await this.embedSvc.embed(refinedQuestion);

    // ── 4. Hybrid Search ─────────────────────────────────────────
    let chunks = await this.searchRepo.hybridSearch({
      embedding:     queryEmbedding,
      queryText:     refinedQuestion,
      tenantId,
      topK:          CANDIDATE_POOL,
      candidatePool: CANDIDATE_POOL,
      filters,
    });

    // Fallback full-text si pas de résultats vectoriels
    if (!chunks.length) {
      logger.debug('No vector results, falling back to full-text search');
      chunks = await this.searchRepo.fullTextSearch({
        queryText: refinedQuestion,
        tenantId,
        topK: CANDIDATE_POOL,
      });
    }

    // ── 5. Re-ranking ─────────────────────────────────────────────
    const rerankedChunks = await this.reranker.rerank(
      refinedQuestion,
      chunks,
      CONTEXT_CHUNKS
    );

    // ── 6. Construction du contexte ──────────────────────────────
    const context = this._buildContext(rerankedChunks);

    // ── 7. Construction du prompt ────────────────────────────────
    const prompt = buildRagPrompt({
      question: refinedQuestion,
      context,
      history,
      summary,
    });

    // ── 8. Streaming LLM ─────────────────────────────────────────
    const sources    = this._formatSources(rerankedChunks);
    const llmStream  = this.llmSvc.stream(prompt, streamOptions);

    // Wrapper qui collecte la réponse complète pour la persister
    const { stream, getFullResponse } = this._wrapStream(llmStream);

    // ── 9. Persistance asynchrone (ne bloque pas le stream) ──────
    this._persistAsync(async () => {
      // Sauvegarder la question utilisateur
      await this.convRepo.saveMessage({
        conversationId: convId,
        role:    'user',
        content: question,
        sources: [],
      });

      // Attendre la réponse complète puis la sauvegarder
      const fullResponse = await getFullResponse();
      const sanitized    = sanitizeResponse(fullResponse);

      await this.convRepo.saveMessage({
        conversationId: convId,
        role:    'assistant',
        content: sanitized,
        sources,
        modelMetadata: {
          model:       process.env.OLLAMA_LLM_MODEL || 'qwen3:8b',
          latencyMs:   Date.now() - startMs,
          refinedQ:    refinedQuestion !== question ? refinedQuestion : undefined,
          chunksUsed:  rerankedChunks.length,
        },
      });

      // Résumé automatique si la conversation devient trop longue
      await this._maybeAutoSummarize(conversation, convId);
    });

    logger.info('RAG query processed', {
      tenantId,
      userId,
      conversationId: convId,
      chunksFound:    chunks.length,
      chunksUsed:     rerankedChunks.length,
      latencyMs:      Date.now() - startMs,
    });

    return {
      stream,
      sources,
      conversationId: convId,
      refinedQuestion: refinedQuestion !== question ? refinedQuestion : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTHODES INTERNES
  // ═══════════════════════════════════════════════════════════════

  // ── Reformulation de la question ────────────────────────────
  async _refineQuestion(question, history, summary) {
    // Pas de reformulation si pas d'historique
    if (!history.length && !summary) return question;

    // Pas de reformulation si la question est autonome (pas de pronoms)
    const pronouns = /\b(il|elle|ils|elles|ce|ça|cela|ceci|le|la|les|lui|leur|y|en)\b/i;
    const refs     = /\b(même|précédent|dernier|ci-dessus|mentionné|ce document)\b/i;
    if (!pronouns.test(question) && !refs.test(question)) return question;

    try {
      const prompt   = QUERY_REFINEMENT_PROMPT(question, history.slice(-3), summary);
      const refined  = await this.llmSvc.complete(prompt, { maxTokens: 150, temperature: 0 });
      const cleaned  = refined.trim().replace(/^["']|["']$/g, '');
      return cleaned || question;
    } catch {
      return question;
    }
  }

  // ── Construction du contexte documentaire ────────────────────
  _buildContext(chunks) {
    if (!chunks.length) {
      return 'Aucune source documentaire disponible pour cette question.';
    }

    return chunks.map((chunk, i) => {
      const title    = chunk.doc_title || chunk.metadata?.title || 'Document';
      const page     = chunk.metadata?.page ? ` (p. ${chunk.metadata.page})` : '';
      const section  = chunk.metadata?.section ? ` — ${chunk.metadata.section}` : '';
      const score    = Math.round((chunk.rerankScore || chunk.hybrid_score || 0) * 100);

      return [
        `[Source ${i + 1}] ${title}${page}${section} (pertinence: ${score}%)`,
        '─'.repeat(40),
        chunk.content,
      ].join('\n');
    }).join('\n\n');
  }

  // ── Format sources pour le frontend ─────────────────────────
  _formatSources(chunks) {
    return chunks.map((chunk, i) => ({
      index:      i + 1,
      chunkId:    chunk.id,
      documentId: chunk.document_id,
      title:      chunk.doc_title || 'Document',
      fileType:   chunk.doc_file_type || 'unknown',
      excerpt:    chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
      page:       chunk.metadata?.page,
      section:    chunk.metadata?.section,
      score:      Math.round((chunk.rerankScore || chunk.hybrid_score || 0) * 100),
    }));
  }

  // ── Wrapper stream : collecte la réponse complète ────────────
  _wrapStream(llmStream) {
    let resolve;
    let fullText = '';
    const responsePromise = new Promise(r => { resolve = r; });

    async function* wrappedStream() {
      try {
        for await (const token of llmStream) {
          fullText += token;
          yield token;
        }
      } finally {
        resolve(fullText);
      }
    }

    return {
      stream:          wrappedStream(),
      getFullResponse: () => responsePromise,
    };
  }

  // ── Persistance asynchrone (fire & forget sécurisé) ──────────
  _persistAsync(fn) {
    fn().catch(err => {
      logger.error('Async persist failed', { error: err.message });
    });
  }

  // ── Résumé automatique de la conversation ────────────────────
  async _maybeAutoSummarize(conversation, convId) {
    if ((conversation.tokens_used || 0) < SUMMARY_TOKEN_THRESHOLD) return;

    logger.info('Auto-summarizing conversation', { convId });

    const messages = await this.convRepo.getMessagesForSummary(convId);
    if (messages.length < 4) return;

    const prompt   = SUMMARY_PROMPT(messages);
    const summary  = await this.llmSvc.complete(prompt, { maxTokens: 300 });
    await this.convRepo.updateSummary(convId, summary.trim());
  }

  // ── Titre automatique depuis la première question ────────────
  _generateTitle(question) {
    const words = question.trim().split(/\s+/);
    const title = words.slice(0, 8).join(' ');
    return title.length < question.length ? title + '...' : title;
  }
}

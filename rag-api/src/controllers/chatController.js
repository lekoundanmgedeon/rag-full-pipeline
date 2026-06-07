/**
 * ChatController
 *
 * Endpoints :
 *   POST /api/chat                 — question + stream SSE
 *   GET  /api/conversations        — liste des conversations
 *   GET  /api/conversations/:id    — détail + messages
 *   DELETE /api/conversations/:id  — suppression
 *   POST /api/messages/:id/feedback — feedback thumbs up/down
 */

import { RAGService }              from '../services/RAGService.js';
import { ConversationRepository }  from '../repositories/ConversationRepository.js';
import { sanitizeQuestion, isValidUUID } from '../utils/security.js';
import { logger }                  from '../utils/logger.js';
import db                          from '../config/database.js';
import { redis }                   from '../config/redis.js';

// Instances partagées (singletons par processus)
const ragService = new RAGService(db, redis);
const convRepo   = new ConversationRepository(db);

export class ChatController {

  // ── POST /api/chat ───────────────────────────────────────────
  /**
   * Reçoit une question et streame la réponse via SSE.
   *
   * Body : { question, conversationId?, filters? }
   *
   * Flux SSE émis :
   *   { type: 'meta',    conversationId, sources, refinedQuestion }
   *   { type: 'token',   content: "..." }  (N fois)
   *   { type: 'done',    latencyMs }
   *   { type: 'error',   message }
   */
  chat = async (req, res) => {
    const { question, conversationId, filters = {} } = req.body;
    const { id: userId, tenantId } = req.user;

    // ── Validation ───────────────────────────────────────────
    let sanitized;
    try {
      sanitized = sanitizeQuestion(question);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (conversationId && !isValidUUID(conversationId)) {
      return res.status(400).json({ error: 'conversationId invalide' });
    }

    // ── Headers SSE ──────────────────────────────────────────
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache, no-transform');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Désactive le buffering nginx
    res.flushHeaders();

    const sendEvent = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    // Keepalive : évite les timeouts proxy sur les réponses longues
    const keepalive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch {}
    }, 15_000);

    const startMs = Date.now();

    try {
      const { stream, sources, conversationId: convId, refinedQuestion } =
        await ragService.query({
          question:       sanitized,
          userId,
          tenantId,
          conversationId,
          filters,
        });

      // ── Envoi des métadonnées d'abord ────────────────────
      sendEvent({
        type:            'meta',
        conversationId:  convId,
        sources,
        refinedQuestion,
      });

      // ── Stream des tokens ────────────────────────────────
      for await (const token of stream) {
        if (token) {
          sendEvent({ type: 'token', content: token });
        }
      }

      // ── Fin du stream ────────────────────────────────────
      sendEvent({ type: 'done', latencyMs: Date.now() - startMs });

      logger.info('Chat completed', {
        userId,
        tenantId,
        conversationId: convId,
        latencyMs: Date.now() - startMs,
      });

    } catch (err) {
      logger.error('Chat error', {
        userId,
        error:  err.message,
        stack:  err.stack,
      });

      const isUserError = err.message.includes('Conversation introuvable')
                       || err.message.includes('invalide');

      sendEvent({
        type:    'error',
        message: isUserError
          ? err.message
          : 'Une erreur est survenue. Veuillez réessayer.',
        code: isUserError ? 'CLIENT_ERROR' : 'SERVER_ERROR',
      });
    } finally {
      clearInterval(keepalive);
      res.end();
    }
  };

  // ── GET /api/conversations ───────────────────────────────────
  listConversations = async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;

    const conversations = await convRepo.listConversations(
      req.user.id,
      req.user.tenantId,
      { limit: Math.min(parseInt(limit), 50), offset: parseInt(offset) }
    );

    return res.json({ conversations });
  };

  // ── GET /api/conversations/:id ───────────────────────────────
  getConversation = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID invalide' });

    const conversation = await convRepo.getConversation(id, req.user.tenantId);
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });

    // Récupérer les messages
    const { rows: messages } = await db.query(
      `SELECT id, role, content, sources, model_metadata, feedback, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return res.json({ conversation, messages });
  };

  // ── DELETE /api/conversations/:id ────────────────────────────
  deleteConversation = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID invalide' });

    const deleted = await convRepo.deleteConversation(id, req.user.tenantId);
    if (!deleted) return res.status(404).json({ error: 'Conversation introuvable' });

    return res.json({ success: true });
  };

  // ── POST /api/messages/:id/feedback ─────────────────────────
  saveFeedback = async (req, res) => {
    const { id }       = req.params;
    const { feedback } = req.body;

    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID invalide' });
    if (![-1, 1].includes(feedback)) {
      return res.status(400).json({ error: 'feedback doit être 1 (positif) ou -1 (négatif)' });
    }

    await convRepo.saveFeedback(id, feedback);

    logger.info('Feedback saved', { messageId: id, feedback, userId: req.user.id });
    return res.json({ success: true });
  };

  // ── GET /api/stats ───────────────────────────────────────────
  getStats = async (req, res) => {
    const stats = await convRepo.getStats(req.user.tenantId);
    return res.json({ stats });
  };
}

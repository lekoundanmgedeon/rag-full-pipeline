/**
 * ConversationRepository
 *
 * Gestion des conversations et messages :
 *   - Historique paginé
 *   - Context window avec résumé automatique
 *   - Mémoire long terme par tenant/user
 */

export class ConversationRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Conversations ────────────────────────────────────────────

  async createConversation({ tenantId, userId, title }) {
    const { rows } = await this.db.query(
      `INSERT INTO conversations (tenant_id, user_id, title)
       VALUES ($1, $2, $3) RETURNING *`,
      [tenantId, userId, title || 'Nouvelle conversation']
    );
    return rows[0];
  }

  async getConversation(id, tenantId) {
    const { rows } = await this.db.query(
      `SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  async listConversations(userId, tenantId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT id, title, summary, tokens_used, created_at, updated_at
       FROM conversations
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, tenantId, limit, offset]
    );
    return rows;
  }

  async updateSummary(id, summary) {
    await this.db.query(
      `UPDATE conversations SET summary = $1, updated_at = NOW() WHERE id = $2`,
      [summary, id]
    );
  }

  async deleteConversation(id, tenantId) {
    const { rowCount } = await this.db.query(
      `DELETE FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return rowCount > 0;
  }

  // ── Messages ─────────────────────────────────────────────────

  async saveMessage({ conversationId, role, content, sources = [], modelMetadata = {} }) {
    const { rows } = await this.db.query(
      `INSERT INTO messages
         (conversation_id, role, content, sources, model_metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, role, content, JSON.stringify(sources), JSON.stringify(modelMetadata)]
    );

    // Mettre à jour la date de la conversation
    await this.db.query(
      `UPDATE conversations
       SET updated_at = NOW(),
           tokens_used = tokens_used + $1
       WHERE id = $2`,
      [modelMetadata.totalTokens || 0, conversationId]
    );

    return rows[0];
  }

  /**
   * Retourne les N derniers messages pour le context window du LLM.
   * Format compatible avec l'API Ollama /api/chat (role/content).
   */
  async getRecentMessages(conversationId, limit = 8) {
    const { rows } = await this.db.query(
      `SELECT role, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );
    // Remettre dans l'ordre chronologique
    return rows.reverse().map(r => ({
      role:    r.role,
      content: r.content,
    }));
  }

  /**
   * Retourne les messages pour construire un résumé automatique.
   * Appelé quand tokens_used dépasse le seuil.
   */
  async getMessagesForSummary(conversationId) {
    const { rows } = await this.db.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows;
  }

  async saveFeedback(messageId, feedback) {
    await this.db.query(
      `UPDATE messages SET feedback = $1 WHERE id = $2`,
      [feedback, messageId]
    );
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(tenantId) {
    const { rows } = await this.db.query(`
      SELECT
        COUNT(DISTINCT c.id)         AS total_conversations,
        COUNT(m.id)                  AS total_messages,
        AVG(c.tokens_used)::int      AS avg_tokens_per_conv,
        COUNT(m.id) FILTER (WHERE m.feedback = 1)  AS positive_feedback,
        COUNT(m.id) FILTER (WHERE m.feedback = -1) AS negative_feedback
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.tenant_id = $1
    `, [tenantId]);
    return rows[0];
  }
}

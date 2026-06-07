/**
 * SearchController
 *
 * Recherche directe dans les documents sans génération LLM.
 * Utile pour : autocomplétion, exploration, débogage RAG.
 *
 * Endpoints :
 *   POST /api/search         — recherche hybrid (résultats bruts)
 *   POST /api/search/vector  — recherche vectorielle pure
 *   POST /api/search/text    — recherche full-text pure
 */

import { SearchRepository }        from '../repositories/SearchRepository.js';
import { OllamaEmbeddingService }  from '../services/EmbeddingService.js';
import { sanitizeQuestion }        from '../utils/security.js';
import { logger }                  from '../utils/logger.js';
import db                          from '../config/database.js';
import { redis }                   from '../config/redis.js';

const searchRepo = new SearchRepository(db);
const embedSvc   = new OllamaEmbeddingService(redis);

export class SearchController {

  // ── POST /api/search ─────────────────────────────────────────
  search = async (req, res) => {
    const { query, topK = 10, filters = {}, mode = 'hybrid' } = req.body;

    let sanitized;
    try {
      sanitized = sanitizeQuestion(query);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const tenantId = req.user.tenantId;
    const startMs  = Date.now();

    try {
      let results;

      if (mode === 'text') {
        results = await searchRepo.fullTextSearch({
          queryText: sanitized, tenantId, topK,
        });
      } else if (mode === 'vector') {
        const embedding = await embedSvc.embed(sanitized);
        results = await searchRepo.vectorSearch({
          embedding, tenantId, topK, filters,
        });
      } else {
        // hybrid (défaut)
        const embedding = await embedSvc.embed(sanitized);
        results = await searchRepo.hybridSearch({
          embedding, queryText: sanitized, tenantId, topK, filters,
        });
      }

      return res.json({
        results: results.map(r => ({
          id:         r.id,
          documentId: r.document_id,
          title:      r.doc_title,
          fileType:   r.doc_file_type,
          excerpt:    r.content.slice(0, 300),
          score:      Math.round((r.hybrid_score || 0) * 100),
          metadata:   r.metadata,
        })),
        total:    results.length,
        latencyMs: Date.now() - startMs,
        mode,
      });

    } catch (err) {
      logger.error('Search error', { error: err.message, tenantId });
      return res.status(500).json({ error: 'Erreur de recherche' });
    }
  };
}

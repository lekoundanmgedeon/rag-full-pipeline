/**
 * SearchRepository
 *
 * Toutes les requêtes de recherche :
 *   - Hybrid search (vectoriel + full-text BM25-like)
 *   - Filtres par document, date, tags
 *   - Pagination par curseur
 */

import { logger } from '../utils/logger.js';

export class SearchRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Hybrid Search principal ───────────────────────────────────
  /**
   * Combine recherche vectorielle (cosine) et full-text PostgreSQL.
   * Score hybride = vec_weight * vec_score + text_weight * text_score
   *
   * @param {object} params
   * @param {number[]} params.embedding     - vecteur requête
   * @param {string}   params.queryText     - texte pour full-text
   * @param {string}   params.tenantId      - isolation tenant
   * @param {number}   params.topK          - nb résultats finaux
   * @param {number}   params.candidatePool - pool initial (avant re-rank)
   * @param {object}   params.filters       - { documentIds, fileTypes, dateFrom }
   * @param {number}   params.vecWeight     - poids vectoriel (défaut 0.7)
   * @param {number}   params.textWeight    - poids full-text (défaut 0.3)
   */
async hybridSearch({
  embedding,
  queryText,
  tenantId,
  topK          = 10,
  candidatePool = 60,
  filters       = {},
  vecWeight     = 0.7,
  textWeight    = 0.3,
}) {
  const embStr         = '[' + embedding.join(',') + ']'
  const normalizedQ    = this._normalizeForTsQuery(queryText)
  const hasDocFilter   = filters.documentIds?.length > 0

  // Construction dynamique selon qu'on a un filtre documentIds ou non
  let sql, params

  if (hasDocFilter) {
    sql = `
      WITH vector_search AS (
        SELECT id, 1 - (embedding <=> $1::vector) AS vec_score
        FROM document_chunks
        WHERE tenant_id = $2
          AND embedding IS NOT NULL
          AND document_id = ANY($3::uuid[])
        ORDER BY embedding <=> $1::vector
        LIMIT ${candidatePool}
      ),
      text_search AS (
        SELECT id, ts_rank_cd(content_tsv, query, 32) AS text_score
        FROM document_chunks, to_tsquery('french', $4) query
        WHERE tenant_id = $2
          AND content_tsv @@ query
          AND document_id = ANY($3::uuid[])
        LIMIT ${candidatePool}
      )
      SELECT
        dc.id, dc.document_id, dc.chunk_index,
        dc.content, dc.token_count, dc.metadata,
        d.title AS doc_title, d.file_type AS doc_file_type,
        COALESCE(vs.vec_score, 0) * ${vecWeight}
          + COALESCE(ts.text_score, 0) * ${textWeight} AS hybrid_score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      LEFT JOIN vector_search vs ON vs.id = dc.id
      LEFT JOIN text_search   ts ON ts.id = dc.id
      WHERE (vs.id IS NOT NULL OR ts.id IS NOT NULL)
        AND dc.tenant_id = $2
        AND d.status = 'indexed'
        AND hybrid_score > 0.05
      ORDER BY hybrid_score DESC
      LIMIT $5
    `
    params = [embStr, tenantId, filters.documentIds, normalizedQ || 'document', topK]

  } else {
    sql = `
      WITH vector_search AS (
        SELECT id, 1 - (embedding <=> $1::vector) AS vec_score
        FROM document_chunks
        WHERE tenant_id = $2
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT ${candidatePool}
      ),
      text_search AS (
        SELECT id, ts_rank_cd(content_tsv, query, 32) AS text_score
        FROM document_chunks, to_tsquery('french', $3) query
        WHERE tenant_id = $2
          AND content_tsv @@ query
        LIMIT ${candidatePool}
      )
      SELECT
        dc.id, dc.document_id, dc.chunk_index,
        dc.content, dc.token_count, dc.metadata,
        d.title AS doc_title, d.file_type AS doc_file_type,
        COALESCE(vs.vec_score, 0) * ${vecWeight}
          + COALESCE(ts.text_score, 0) * ${textWeight} AS hybrid_score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      LEFT JOIN vector_search vs ON vs.id = dc.id
      LEFT JOIN text_search   ts ON ts.id = dc.id
      WHERE (vs.id IS NOT NULL OR ts.id IS NOT NULL)
        AND dc.tenant_id = $2
        AND d.status = 'indexed'
      ORDER BY hybrid_score DESC
      LIMIT $4
    `
    params = [embStr, tenantId, normalizedQ || 'document', topK]
  }

  const startMs = Date.now()
  const { rows } = await this.db.query(sql, params)
  logger.debug(`Hybrid search: ${rows.length} results in ${Date.now() - startMs}ms`)
  return rows
}

  // ── Recherche vectorielle pure (fallback) ─────────────────────
  async vectorSearch({ embedding, tenantId, topK = 20, filters = {} }) {
    const { conditions, values } = this._buildFilters(tenantId, filters, 3);

    const { rows } = await this.db.query(`
      SELECT
        dc.id, dc.document_id, dc.chunk_index,
        dc.content, dc.token_count, dc.metadata,
        d.title AS doc_title, d.file_type AS doc_file_type,
        1 - (dc.embedding <=> $1::vector) AS vec_score,
        1 - (dc.embedding <=> $1::vector) AS hybrid_score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.tenant_id = $2
        AND dc.embedding IS NOT NULL
        AND d.status = 'indexed'
        ${conditions.join(' ')}
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $3
    `, ['[' + embedding.join(',') + ']', tenantId, topK, ...values]);

    return rows;
  }

  // ── Recherche full-text pure (fallback si pas d'embedding) ────
  async fullTextSearch({ queryText, tenantId, topK = 20 }) {
    const normalized = this._normalizeForTsQuery(queryText);
    if (!normalized) return [];

    const { rows } = await this.db.query(`
      SELECT
        dc.id, dc.document_id, dc.chunk_index,
        dc.content, dc.token_count, dc.metadata,
        d.title AS doc_title, d.file_type AS doc_file_type,
        0 AS vec_score,
        ts_rank_cd(dc.content_tsv, query, 32) AS hybrid_score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id,
           to_tsquery('french', $1) AS query
      WHERE dc.tenant_id = $2
        AND dc.content_tsv @@ query
        AND d.status = 'indexed'
      ORDER BY hybrid_score DESC
      LIMIT $3
    `, [normalized, tenantId, topK]);

    return rows;
  }

  // ── Contexte voisin (adjacent chunks) ────────────────────────
  /**
   * Récupère les chunks adjacents d'un chunk pertinent
   * pour enrichir le contexte (fenêtre glissante).
   */
  async getAdjacentChunks(documentId, chunkIndex, window = 1) {
    const { rows } = await this.db.query(`
      SELECT id, chunk_index, content, metadata
      FROM document_chunks
      WHERE document_id = $1
        AND chunk_index BETWEEN $2 AND $3
      ORDER BY chunk_index
    `, [documentId, chunkIndex - window, chunkIndex + window]);
    return rows;
  }

  // ── Helpers privés ────────────────────────────────────────────

  _buildFilters(tenantId, filters, startIdx) {
    const conditions = [];
    const values     = [];
    let   idx        = startIdx;

    if (filters.dateFrom) {
      conditions.push(`AND d.created_at >= $${idx++}`);
      values.push(filters.dateFrom);
    }
    if (filters.fileTypes?.length) {
      conditions.push(`AND d.file_type = ANY($${idx++}::text[])`);
      values.push(filters.fileTypes);
    }

    return { conditions, values, nextIdx: idx };
  }

  _buildParams({ embedding, tenantId, queryText, filters, topK, nextIdx }) {
    const embStr = '[' + embedding.join(',') + ']';

    if (filters.documentIds?.length) {
      // Avec filtre documentIds : $1=embed, $2=tenant, $3=docIds (vec), $4=tsquery, $5+=filters, $N=topK
      return [embStr, tenantId, filters.documentIds, queryText, topK];
    }
    // Sans filtre : $1=embed, $2=tenant, $3=tsquery, $N=topK
    return [embStr, tenantId, queryText, topK];
  }

  _normalizeForTsQuery(text) {
    if (!text) return '';
    return text
      .trim()
      // Supprimer les caractères spéciaux ts_query
      .replace(/[&|!():*']/g, ' ')
      // Normaliser les espaces
      .replace(/\s+/g, ' ')
      .trim()
      // Rejoindre les mots avec & pour AND
      .split(' ')
      .filter(w => w.length > 2)
      .join(' & ') || '';
  }
}

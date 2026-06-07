-- ═══════════════════════════════════════════════════════════════
-- Migration 001 — Schéma RAG complet
-- Compatible : PostgreSQL 14+ avec extension pgvector
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────
-- TENANTS (multi-tenant)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  settings   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID,                              -- nullable si import système
  title         TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     VARCHAR(30) NOT NULL,              -- pdf|docx|xlsx|csv|html|txt
  file_size     BIGINT NOT NULL DEFAULT 0,
  storage_path  TEXT,                              -- chemin fichier sur disque
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','indexed','error','deleted')),
  error_message TEXT,
  metadata      JSONB DEFAULT '{}',               -- {author, source_url, tags[]}
  language      VARCHAR(10) DEFAULT 'fr',
  chunk_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  indexed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant     ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_user       ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_metadata   ON documents USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_documents_created    ON documents(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT CHUNKS (cœur du RAG)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  content_tsv   TSVECTOR,                         -- pour full-text search
  -- Dimension configurable selon modèle Ollama :
  -- nomic-embed-text=768, mxbai-embed-large=1024, all-minilm=384
  embedding     VECTOR(768),
  token_count   INTEGER,
  char_count    INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  metadata      JSONB DEFAULT '{}',               -- {page, section, headings[], source_offset}
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

-- Index HNSW pour recherche vectorielle rapide
-- m=16 : bon équilibre précision/mémoire
-- ef_construction=64 : précision de construction
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index pour filtrage tenant (essentiel multi-tenant)
CREATE INDEX IF NOT EXISTS idx_chunks_tenant    ON document_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document  ON document_chunks(document_id);

-- Index full-text pour hybrid search
CREATE INDEX IF NOT EXISTS idx_chunks_tsv
  ON document_chunks USING GIN(content_tsv);

-- Index trigramme pour recherche approximative
CREATE INDEX IF NOT EXISTS idx_chunks_trgm
  ON document_chunks USING GIN(content gin_trgm_ops);

-- Trigger : maintient le tsvector automatiquement
CREATE OR REPLACE FUNCTION update_chunk_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsv := to_tsvector(
    COALESCE(
      (SELECT language FROM documents WHERE id = NEW.document_id),
      'french'
    ),
    NEW.content
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chunk_tsv ON document_chunks;
CREATE TRIGGER trg_chunk_tsv
  BEFORE INSERT OR UPDATE OF content ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION update_chunk_tsv();

-- ─────────────────────────────────────────────────────────────
-- INGESTION JOBS (tracking)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  queue_job_id TEXT,                              -- BullMQ job id
  status       VARCHAR(20) DEFAULT 'queued'
               CHECK (status IN ('queued','parsing','chunking','embedding','done','failed')),
  progress     SMALLINT DEFAULT 0,               -- 0-100
  stats        JSONB DEFAULT '{}',               -- {chunks_total, chunks_embedded, parse_ms, embed_ms}
  error        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_document ON ingestion_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON ingestion_jobs(status);

-- ─────────────────────────────────────────────────────────────
-- CONVERSATIONS & MESSAGES (pour le chat RAG)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL,
  user_id      UUID NOT NULL,
  title        TEXT,
  summary      TEXT,
  tokens_used  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  sources         JSONB DEFAULT '[]',            -- [{chunk_id, score, excerpt, doc_title}]
  model_metadata  JSONB DEFAULT '{}',            -- {model, latency_ms, prompt_tokens, completion_tokens}
  feedback        SMALLINT CHECK (feedback IN (-1, 0, 1)),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- FONCTIONS UTILITAIRES
-- ─────────────────────────────────────────────────────────────

-- Fonction hybrid search (vectoriel + full-text)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding VECTOR,
  query_text      TEXT,
  p_tenant_id     UUID,
  p_top_k         INTEGER DEFAULT 10,
  vec_weight      FLOAT DEFAULT 0.7,
  text_weight     FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  content     TEXT,
  metadata    JSONB,
  vec_score   FLOAT,
  text_score  FLOAT,
  hybrid_score FLOAT
)
LANGUAGE SQL STABLE AS $$
  WITH vector_search AS (
    SELECT
      dc.id,
      1 - (dc.embedding <=> query_embedding) AS score
    FROM document_chunks dc
    WHERE dc.tenant_id = p_tenant_id
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> query_embedding
    LIMIT p_top_k * 5
  ),
  text_search AS (
    SELECT
      dc.id,
      ts_rank_cd(dc.content_tsv, query, 32) AS score
    FROM document_chunks dc,
         to_tsquery('french', query_text) query
    WHERE dc.tenant_id = p_tenant_id
      AND dc.content_tsv @@ query
    LIMIT p_top_k * 5
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    COALESCE(vs.score, 0)   AS vec_score,
    COALESCE(ts.score, 0)   AS text_score,
    COALESCE(vs.score, 0) * vec_weight +
    COALESCE(ts.score, 0) * text_weight AS hybrid_score
  FROM document_chunks dc
  LEFT JOIN vector_search vs ON vs.id = dc.id
  LEFT JOIN text_search   ts ON ts.id = dc.id
  WHERE vs.id IS NOT NULL OR ts.id IS NOT NULL
  ORDER BY hybrid_score DESC
  LIMIT p_top_k;
$$;

-- Trigger updated_at documents
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documents_updated
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

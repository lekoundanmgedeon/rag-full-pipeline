# RAG Platform

Plateforme d'assistant IA conversationnel basée sur une architecture RAG (Retrieval-Augmented Generation). Permet aux utilisateurs de poser des questions en langage naturel sur des documents métier et procédures internes, avec des réponses générées localement via Ollama (Qwen3 / Gemma).

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend API | Node.js 20 + Express (ESM) |
| Base de données | PostgreSQL 16 + pgvector |
| Queue | BullMQ + Redis 7 |
| LLM local | Ollama — Qwen3:8b / Gemma3:9b |
| Embeddings | Ollama — nomic-embed-text (768 dims) |
| Frontend | Vue.js 3 + Pinia + Vite |
| Reverse proxy | Nginx + Let's Encrypt |
| CI/CD | GitHub Actions |

---

## Structure du repo

```
rag-pipeline/
│
├── rag-api/              ← API unifiée (ingestion + chat + search)
│   ├── src/
│   │   ├── config/           database.js, redis.js
│   │   ├── services/         EmbeddingService, LLMService, RAGService,
│   │   │                     IngestionService, DocumentParser, Chunker,
│   │   │                     RerankerService
│   │   ├── repositories/     DocumentRepository, SearchRepository,
│   │   │                     ConversationRepository
│   │   ├── controllers/      uploadController, chatController, searchController
│   │   ├── routes/           upload.js, chat.js, search.js
│   │   ├── workers/          ingestionWorker.js (BullMQ)
│   │   ├── middlewares/      auth.js (JWT + tenant isolation)
│   │   ├── prompts/          templates.js
│   │   ├── utils/            logger.js, security.js
│   │   └── server.js         point d'entrée (port 3000)
│   ├── migrations/           schéma PostgreSQL + pgvector
│   ├── scripts/              consolidate.sh
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example
│
├── rag-frontend/         ← Interface Vue.js 3
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/         ChatMessage, ChatInput, SourcePanel
│   │   │   ├── upload/       UploadModal, UploadQueueItem
│   │   │   └── layout/       AppSidebar, ConversationItem
│   │   ├── stores/           chatStore.js (Pinia)
│   │   ├── services/         api.js (SSE streaming, upload)
│   │   ├── composables/      useAutoScroll, useMarkdown, useFileFormat
│   │   ├── views/            ChatView.vue
│   │   └── main.js
│   ├── Dockerfile
│   ├── nginx-spa.conf
│   └── .env.example
│
├── rag-deploy/           ← Orchestration production
│   ├── docker-compose.prod.yml
│   ├── docker-compose.dev.yml
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/rag.conf   (SSL, rate limiting, SSE headers)
│   ├── scripts/
│   │   ├── setup-server.sh   bootstrap VPS Ubuntu 22.04
│   │   ├── first-deploy.sh   SSL + migrations + modèles Ollama
│   │   ├── rollback.sh
│   │   └── backup.sh
│   ├── monitoring/
│   │   └── prometheus.yml
│   └── .env.production.example
│
└── .github/
    └── workflows/
        └── deploy.yml        CI/CD GitHub Actions
```

---

## Démarrage local

### Prérequis

- Node.js 20+
- Docker + Docker Compose
- Ollama installé localement

### 1. Infrastructure

```bash
cd rag-deploy
docker compose -f docker-compose.dev.yml up -d

# Télécharger les modèles (une fois)
docker exec rag-ollama-dev ollama pull nomic-embed-text
docker exec rag-ollama-dev ollama pull qwen3:8b
```

### 2. API

```bash
cd rag-api
cp .env.example .env
npm install
npm run migrate       # applique le schéma PostgreSQL
npm run dev           # API sur http://localhost:3000
# Dans un second terminal :
npm run worker        # BullMQ worker pour les embeddings
```

### 3. Frontend

```bash
cd rag-frontend
cp .env.example .env
npm install
npm run dev           # Interface sur http://localhost:5173
```

### Vérification

```bash
curl http://localhost:3000/health
# → { "status": "healthy", "checks": { "db": "ok", "redis": "ok", ... } }
```

---

## Routes API

### Ingestion documentaire

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload + indexation asynchrone |
| `GET` | `/api/documents` | Liste des documents |
| `GET` | `/api/documents/:id` | Détail d'un document |
| `GET` | `/api/documents/:id/status` | Progression indexation (SSE) |
| `DELETE` | `/api/documents/:id` | Suppression |
| `POST` | `/api/documents/:id/reindex` | Re-indexation |

### Chat RAG

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/chat` | Question → réponse streamée (SSE) |
| `GET` | `/api/conversations` | Liste des conversations |
| `GET` | `/api/conversations/:id` | Conversation + messages |
| `DELETE` | `/api/conversations/:id` | Suppression |
| `POST` | `/api/messages/:id/feedback` | Feedback utilisateur (±1) |

### Recherche

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/search` | Recherche hybrid (vectoriel + full-text) |
| `GET` | `/api/stats` | Statistiques conversations |
| `GET` | `/health` | Santé du système |

---

## Pipeline RAG

```
Question utilisateur
  ↓ sanitizeQuestion()          — protection prompt injection
  ↓ _refineQuestion()           — reformulation contextuelle (si historique)
  ↓ embed()                     — vecteur nomic-embed-text (768 dims)
  ↓ hybridSearch()              — 40 candidats (70% cosine + 30% full-text)
  ↓ reranker.rerank()           — sélection top 6 (TF + bigrammes)
  ↓ _buildContext()             — [Source N] titre\ncontenu...
  ↓ buildRagPrompt()            — system + historique + contexte + question
  ↓ llmSvc.stream()             — tokens Qwen3 via Ollama SSE
  ↓ _persistAsync()             — sauvegarde conversation (non-bloquant)
  ↓ SSE → frontend              — { meta }, { token }, { done }
```

## Pipeline d'ingestion

```
Fichier uploadé (PDF / DOCX / XLSX / CSV / HTML / TXT)
  ↓ DocumentParser              — extraction texte brut
  ↓ RecursiveChunker            — chunks 512 tokens, overlap 80
  ↓ DocumentRepository          — INSERT document_chunks en bulk
  ↓ BullMQ queue                — job asynchrone
  ↓ EmbeddingService (worker)   — batches → nomic-embed-text → pgvector HNSW
  ↓ documents.status = 'indexed'
  ↓ SSE /status                 — progression temps réel
```

---

## Modèles Ollama recommandés

### Embeddings

| Modèle | Dimensions | Qualité | Vitesse |
|---|---|---|---|
| `nomic-embed-text` | 768 | ★★★★☆ | ★★★★★ |
| `mxbai-embed-large` | 1024 | ★★★★★ | ★★★☆☆ |

### LLM

| Modèle | RAM min | Qualité | Vitesse |
|---|---|---|---|
| `qwen3:8b` | 8 Go | ★★★★☆ | ★★★★☆ |
| `qwen3:14b` | 16 Go | ★★★★★ | ★★★☆☆ |
| `gemma3:9b` | 10 Go | ★★★★☆ | ★★★★☆ |
| `mistral:7b` | 8 Go | ★★★☆☆ | ★★★★★ |

> Si vous changez de modèle d'embeddings, adapter `EMBEDDING_DIMENSIONS` dans `.env`
> et modifier la colonne : `ALTER TABLE document_chunks ALTER COLUMN embedding TYPE VECTOR(1024);`

---

## Déploiement production (VPS)

### Prérequis serveur

| Ressource | Minimum | Recommandé |
|---|---|---|
| CPU | 4 cores | 8 cores |
| RAM | 16 Go | 32 Go |
| Stockage | 100 Go SSD | 200 Go SSD |
| OS | Ubuntu 22.04 | Ubuntu 22.04 LTS |

### Première mise en production

```bash
# 1. Bootstrap du VPS
scp rag-deploy/scripts/setup-server.sh ubuntu@VOTRE_IP:~/
ssh ubuntu@VOTRE_IP "sudo bash setup-server.sh votre-domaine.com"

# 2. DNS : enregistrement A → VOTRE_IP

# 3. Déployer les fichiers
rsync -avz rag-deploy/ ubuntu@VOTRE_IP:/opt/rag/

# 4. Configurer les secrets
ssh ubuntu@VOTRE_IP "cd /opt/rag && cp .env.production.example .env && nano .env"

# 5. Premier lancement (SSL + migrations + modèles Ollama)
ssh ubuntu@VOTRE_IP "cd /opt/rag && bash scripts/first-deploy.sh"
```

### CI/CD automatique

Chaque `push` sur `main` déclenche le pipeline GitHub Actions :

1. Tests & lint des 3 services
2. Build et push des images Docker sur GHCR
3. Déploiement SSH rolling sur le VPS
4. Migration DB + health check

**Secrets GitHub requis** (Settings → Secrets → Actions) :

| Secret | Description |
|---|---|
| `VPS_HOST` | IP ou domaine du serveur |
| `VPS_USER` | Utilisateur SSH |
| `VPS_SSH_KEY` | Clé privée SSH |
| `VPS_DEPLOY_PATH` | `/opt/rag` |
| `DB_PASSWORD` | Mot de passe PostgreSQL |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `DOMAIN` | `votre-domaine.com` |
| `LETSENCRYPT_EMAIL` | Email Let's Encrypt |

### Commandes utiles en production

```bash
# Status
docker compose -f docker-compose.prod.yml ps

# Logs en temps réel
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker

# Rollback
bash scripts/rollback.sh sha-a1b2c3d

# Backup base de données
bash scripts/backup.sh
```

---

## Variables d'environnement clés

| Variable | Défaut | Description |
|---|---|---|
| `OLLAMA_LLM_MODEL` | `qwen3:8b` | Modèle de génération |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Modèle d'embeddings |
| `CHUNK_MAX_TOKENS` | `512` | Taille des chunks |
| `CHUNK_OVERLAP_TOKENS` | `80` | Chevauchement entre chunks |
| `CANDIDATE_POOL` | `40` | Chunks récupérés avant re-ranking |
| `CONTEXT_CHUNKS` | `6` | Chunks envoyés au LLM |
| `HISTORY_WINDOW` | `6` | Messages d'historique dans le prompt |
| `SUMMARY_TOKEN_THRESHOLD` | `6000` | Seuil déclenchant le résumé auto |
| `WORKER_CONCURRENCY` | `3` | Documents indexés en parallèle |

---

## Sécurité

- **JWT** sur toutes les routes, avec isolation tenant automatique
- **Prompt injection** : 15 patterns détectés, erreur 400 avant tout appel LLM
- **Row Level Security** PostgreSQL configurable sur `document_chunks`
- **Rate limiting** : 20 req/min sur `/api/chat`, 10 uploads/10 min
- **Nginx** : HSTS, CSP, headers sécurité, TLS 1.2/1.3 uniquement
- **Données locales** : Ollama tourne en local, aucune donnée envoyée à une API externe

---

## Formats de documents supportés

`PDF` `DOCX` `DOC` `XLSX` `XLS` `CSV` `HTML` `TXT` `Markdown`

Taille maximale configurable via `MAX_FILE_SIZE_MB` (défaut : 50 Mo).
#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# scripts/consolidate.sh — version corrigée
# Crée les dossiers avant de copier les fichiers
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(pwd)"
TARGET="$ROOT/rag-api"

echo "════════════════════════════════════════"
echo "  Consolidation rag-ingestion + rag-engine → rag-api"
echo "════════════════════════════════════════"

[ -d "$ROOT/rag-ingestion" ] || { echo "❌ rag-ingestion/ introuvable"; exit 1; }
[ -d "$ROOT/rag-engine"    ] || { echo "❌ rag-engine/ introuvable";    exit 1; }

# ── Créer TOUS les dossiers nécessaires ────────────────────────────
echo "▶ Creating directory structure..."
mkdir -p "$TARGET/src/config"
mkdir -p "$TARGET/src/services"
mkdir -p "$TARGET/src/repositories"
mkdir -p "$TARGET/src/controllers"
mkdir -p "$TARGET/src/middlewares"
mkdir -p "$TARGET/src/routes"
mkdir -p "$TARGET/src/workers"
mkdir -p "$TARGET/src/prompts"
mkdir -p "$TARGET/src/utils"
mkdir -p "$TARGET/migrations"
mkdir -p "$TARGET/scripts"
mkdir -p "$TARGET/uploads"
echo "✅ Directories created"

# ── Depuis rag-ingestion ───────────────────────────────────────────
echo "▶ Copying from rag-ingestion..."
cp "$ROOT/rag-ingestion/src/services/DocumentParser.js"         "$TARGET/src/services/"
cp "$ROOT/rag-ingestion/src/services/Chunker.js"                "$TARGET/src/services/"
cp "$ROOT/rag-ingestion/src/services/IngestionService.js"       "$TARGET/src/services/"
cp "$ROOT/rag-ingestion/src/repositories/DocumentRepository.js" "$TARGET/src/repositories/"
cp "$ROOT/rag-ingestion/src/controllers/uploadController.js"    "$TARGET/src/controllers/"
cp "$ROOT/rag-ingestion/src/routes/upload.js"                   "$TARGET/src/routes/"
cp "$ROOT/rag-ingestion/src/workers/ingestionWorker.js"         "$TARGET/src/workers/"
cp "$ROOT/rag-ingestion/migrations/"*.sql                        "$TARGET/migrations/" 2>/dev/null || true
cp "$ROOT/rag-ingestion/migrations/run.js"                       "$TARGET/migrations/" 2>/dev/null || true
echo "✅ rag-ingestion done"

# ── Depuis rag-engine ──────────────────────────────────────────────
echo "▶ Copying from rag-engine..."
cp "$ROOT/rag-engine/src/services/LLMService.js"                     "$TARGET/src/services/"
cp "$ROOT/rag-engine/src/services/RAGService.js"                     "$TARGET/src/services/"
cp "$ROOT/rag-engine/src/services/RerankerService.js"                "$TARGET/src/services/"
cp "$ROOT/rag-engine/src/repositories/SearchRepository.js"           "$TARGET/src/repositories/"
cp "$ROOT/rag-engine/src/repositories/ConversationRepository.js"     "$TARGET/src/repositories/"
cp "$ROOT/rag-engine/src/controllers/chatController.js"              "$TARGET/src/controllers/"
cp "$ROOT/rag-engine/src/controllers/searchController.js"            "$TARGET/src/controllers/"
cp "$ROOT/rag-engine/src/routes/chat.js"                             "$TARGET/src/routes/"
cp "$ROOT/rag-engine/src/routes/search.js"                           "$TARGET/src/routes/"
cp "$ROOT/rag-engine/src/prompts/templates.js"                       "$TARGET/src/prompts/"
cp "$ROOT/rag-engine/src/utils/security.js"                          "$TARGET/src/utils/"
echo "✅ rag-engine done"

# ── Corriger les imports dans les fichiers copiés ──────────────────
# IngestionService importait EmbeddingService depuis rag-ingestion
# Dans rag-api le chemin est identique, rien à changer.
# RAGService de rag-engine importait un EmbeddingService local simplifié.
# On remplace cet import par le service complet (déjà dans rag-api).
echo "▶ Fixing RAGService import path..."
sed -i "s|from './EmbeddingService.js'|from './EmbeddingService.js'|g" \
    "$TARGET/src/services/RAGService.js" 2>/dev/null || true
# Correction : rag-engine/RAGService importait depuis un fichier local stub.
# La version consolidée EmbeddingService.js est au même chemin → pas de changement.
echo "✅ Import paths OK"

# ── Vérification finale ────────────────────────────────────────────
echo ""
echo "▶ Final structure:"
find "$TARGET/src" -type f -name "*.js" | sort | sed "s|$TARGET/||"

echo ""
echo "════════════════════════════════════════"
echo "✅ Consolidation complete!"
echo ""
echo "Next steps:"
echo "  cd rag-api"
echo "  cp .env.example .env && nano .env"
echo "  npm install"
echo "  npm run migrate"
echo "  npm run dev      # API sur :3000"
echo "  npm run worker   # dans un autre terminal"
echo ""
echo "Frontend — mettre à jour rag-frontend/.env :"
echo "  VITE_API_BASE_URL=http://localhost:3000"
echo "════════════════════════════════════════"
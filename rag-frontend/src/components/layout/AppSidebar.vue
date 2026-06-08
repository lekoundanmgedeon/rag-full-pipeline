<template>
  <aside class="sidebar">

    <!-- Logo + New Chat -->
    <div class="sidebar-header">
      <div class="logo">
        <span class="logo-icon">◆</span>
        <span class="logo-text">RAG<span class="logo-accent">Assistant</span></span>
      </div>
      <button class="btn-new" @click="store.newConversation()" title="Nouvelle conversation">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M7.5 1v13M1 7.5h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Upload Zone -->
    <div class="sidebar-section">
      <button class="btn-upload" @click="showUpload = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Ajouter des documents
      </button>
      <button class="btn-logout" @click="logoutUser" type="button">
        Déconnexion
      </button>

      <!-- Queue uploads en cours -->
      <TransitionGroup name="upload-item" tag="div" class="upload-queue">
        <UploadQueueItem
          v-for="item in activeUploads"
          :key="item.id"
          :item="item"
          @remove="store.removeFromQueue(item.id)"
        />
      </TransitionGroup>
    </div>

    <!-- Conversations -->
    <div class="sidebar-convs">
      <div class="section-label">Conversations</div>

      <div v-if="store.isLoadingConvs" class="loading-list">
        <div class="skeleton" v-for="i in 4" :key="i" />
      </div>

      <div v-else-if="!store.conversations.length" class="empty-convs">
        Aucune conversation.<br>Posez votre première question.
      </div>

      <TransitionGroup name="conv-item" tag="div" class="conv-list" v-else>
        <ConversationItem
          v-for="conv in store.conversations"
          :key="conv.id"
          :conv="conv"
          :active="conv.id === store.currentConvId"
          @select="store.selectConversation(conv.id)"
          @delete="store.deleteConversation(conv.id)"
        />
      </TransitionGroup>
    </div>

  </aside>

  <!-- Upload Modal -->
  <UploadModal v-if="showUpload" @close="showUpload = false" />
</template>

<script setup>
import { ref, computed }       from 'vue'
import { useRouter }           from 'vue-router'
import { useChatStore }        from '../../stores/chatStore.js'
import { logout }              from '../../services/api.js'
import ConversationItem        from './ConversationItem.vue'
import UploadQueueItem         from '../upload/UploadQueueItem.vue'
import UploadModal             from '../upload/UploadModal.vue'

const store      = useChatStore()
const router     = useRouter()
const showUpload = ref(false)

function logoutUser() {
  logout()
  store.conversations = []
  store.messages = []
  store.currentConvId = null
  router.push('/login')
}

const activeUploads = computed(() =>
  store.uploadQueue.filter(u => u.status !== 'done')
)
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  height: 100vh;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.logo-icon {
  color: var(--accent);
  font-size: 12px;
}

.logo-accent { color: var(--accent); }

.btn-new {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.btn-new:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/* ── Upload ── */
.sidebar-section {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.btn-upload,
.btn-logout {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-strong);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.btn-upload:hover,
.btn-logout:hover {
  border-color: var(--accent-dim);
  color: var(--accent);
  background: var(--accent-glow);
}

.upload-queue {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── Conversations ── */
.sidebar-convs {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 6px 8px 8px;
}

.loading-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}

.skeleton {
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 50%, var(--bg-elevated) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.empty-convs {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 24px 12px;
  line-height: 1.8;
}

.conv-list { display: flex; flex-direction: column; gap: 2px; }

/* Transitions */
.conv-item-enter-active,
.conv-item-leave-active { transition: all 0.2s var(--ease); }
.conv-item-enter-from   { opacity: 0; transform: translateX(-8px); }
.conv-item-leave-to     { opacity: 0; transform: translateX(-8px); }

.upload-item-enter-active,
.upload-item-leave-active { transition: all 0.2s var(--ease); }
.upload-item-enter-from   { opacity: 0; transform: translateY(-4px); }
.upload-item-leave-to     { opacity: 0; height: 0; margin: 0; padding: 0; }
</style>

<template>
  <div class="chat-view">

    <!-- Header -->
    <header class="chat-header">
      <div class="chat-header-info">
        <h1 class="chat-title">
          {{ store.currentConversation?.title || 'Nouvelle conversation' }}
        </h1>
        <span v-if="store.isStreaming" class="streaming-badge">
          <span class="dot" />Génération en cours
        </span>
      </div>
    </header>

    <!-- Messages list -->
    <div
      class="messages-container"
      ref="messagesEl"
      @scroll="onScroll"
    >
      <!-- Welcome screen -->
      <div v-if="!store.messages.length" class="welcome">
        <div class="welcome-icon">◆</div>
        <h2 class="welcome-title">Comment puis-je vous aider ?</h2>
        <p class="welcome-sub">
          Posez une question sur vos documents ou procédures internes.
        </p>
        <div class="welcome-suggestions">
          <button
            v-for="s in suggestions"
            :key="s"
            class="suggestion-chip"
            @click="submitQuestion(s)"
          >{{ s }}</button>
        </div>
      </div>

      <!-- Messages -->
      <TransitionGroup name="msg" tag="div" class="messages-list">
        <ChatMessage
          v-for="msg in store.messages"
          :key="msg.id"
          :message="msg"
          @feedback="store.sendFeedback(msg.id, $event)"
          @sourceClick="onSourceClick"
        />
      </TransitionGroup>

      <!-- Scroll anchor -->
      <div ref="bottomEl" style="height:1px" />
    </div>

    <!-- Source panel slide-in -->
    <Transition name="source-panel">
      <SourcePanel
        v-if="activeSource"
        :source="activeSource"
        @close="activeSource = null"
      />
    </Transition>

    <!-- Input area -->
    <ChatInput
      :disabled="store.isStreaming"
      :error="store.streamError"
      @submit="submitQuestion"
    />

  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRoute }      from 'vue-router'
import { useChatStore }  from '../stores/chatStore.js'
import { useAutoScroll } from '../composables/index.js'
import ChatMessage       from '../components/chat/ChatMessage.vue'
import ChatInput         from '../components/chat/ChatInput.vue'
import SourcePanel       from '../components/chat/SourcePanel.vue'

const store      = useChatStore()
const route      = useRoute()
const messagesEl = ref(null)
const bottomEl   = ref(null)
const activeSource = ref(null)

const { onScroll, scrollToBottom } = useAutoScroll(messagesEl)

const suggestions = [
  'Quelles sont les procédures RH disponibles ?',
  'Résume les documents récemment ajoutés',
  'Comment fonctionne le processus d\'onboarding ?',
]

// Charger la conversation depuis l'URL
onMounted(async () => {
  if (route.params.id && route.params.id !== store.currentConvId) {
    await store.selectConversation(route.params.id)
  }
  await nextTick()
  scrollToBottom(true)
})

// Auto-scroll à chaque nouveau token
watch(
  () => store.messages.map(m => m.content).join('').length,
  () => scrollToBottom()
)

// Scroll forcé quand un nouveau message user arrive
watch(
  () => store.messages.length,
  () => scrollToBottom(true)
)

async function submitQuestion(q) {
  if (!q?.trim()) return
  await store.sendMessage(q)
}

function onSourceClick(source) {
  activeSource.value = source
}
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-app);
  position: relative;
}

/* ── Header ── */
.chat-header {
  display: flex;
  align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-app);
  min-height: 56px;
  flex-shrink: 0;
}

.chat-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chat-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

.streaming-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  font-weight: 400;
  flex-shrink: 0;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}

/* ── Messages ── */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0 8px;
  scroll-behavior: smooth;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ── Welcome ── */
.welcome {
  max-width: 520px;
  margin: 60px auto 0;
  padding: 0 24px;
  text-align: center;
  animation: fadeIn 0.4s var(--ease);
}

.welcome-icon {
  font-size: 28px;
  color: var(--accent);
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.welcome-sub {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 28px;
}

.welcome-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.suggestion-chip {
  padding: 8px 14px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-strong);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  line-height: 1.4;
}
.suggestion-chip:hover {
  border-color: var(--accent-dim);
  color: var(--accent);
  background: var(--accent-glow);
}

/* ── Source panel ── */
.source-panel-enter-active,
.source-panel-leave-active { transition: all 0.25s var(--ease); }
.source-panel-enter-from   { opacity: 0; transform: translateY(8px); }
.source-panel-leave-to     { opacity: 0; transform: translateY(8px); }

/* ── Msg transition ── */
.msg-enter-active { animation: fadeIn 0.2s var(--ease); }
</style>

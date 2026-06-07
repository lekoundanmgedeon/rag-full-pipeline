<template>
  <div class="message" :class="[`message--${message.role}`, { 'message--error': message.isError }]">

    <!-- Avatar -->
    <div class="message-avatar">
      <template v-if="message.role === 'user'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </template>
      <template v-else>
        <span class="ai-dot">◆</span>
      </template>
    </div>

    <!-- Content -->
    <div class="message-body">

      <!-- Refined question badge -->
      <div v-if="message.refinedQuestion" class="refined-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
            stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Question reformulée : <em>{{ message.refinedQuestion }}</em>
      </div>

      <!-- Message text -->
      <div
        v-if="message.role === 'assistant'"
        class="message-text markdown-body"
        v-html="renderedContent"
        @click="onContentClick"
      />
      <div v-else class="message-text message-text--user">
        {{ message.content }}
      </div>

      <!-- Cursor clignotant pendant le stream -->
      <span v-if="message.streaming && !message.isError" class="stream-cursor" />

      <!-- Sources -->
      <div v-if="message.sources?.length" class="sources-row">
        <span class="sources-label">Sources :</span>
        <button
          v-for="src in message.sources"
          :key="src.index"
          class="source-chip"
          @click="$emit('sourceClick', src)"
          :title="src.title"
        >
          <span class="source-chip-num">{{ src.index }}</span>
          <span class="source-chip-title truncate">{{ src.title }}</span>
          <span class="source-chip-score">{{ src.score }}%</span>
        </button>
      </div>

      <!-- Footer : latence + feedback -->
      <div v-if="message.role === 'assistant' && !message.streaming && !message.isError"
           class="message-footer">
        <span v-if="message.latencyMs" class="latency">
          {{ (message.latencyMs / 1000).toFixed(1) }}s
        </span>
        <div class="feedback-btns">
          <button
            class="feedback-btn"
            :class="{ active: message.feedback === 1 }"
            @click="$emit('feedback', message.feedback === 1 ? 0 : 1)"
            title="Réponse utile"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                :fill="message.feedback === 1 ? 'currentColor' : 'none'"/>
              <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            class="feedback-btn feedback-btn--down"
            :class="{ active: message.feedback === -1 }"
            @click="$emit('feedback', message.feedback === -1 ? 0 : -1)"
            title="Réponse insuffisante"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                :fill="message.feedback === -1 ? 'currentColor' : 'none'"/>
              <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMarkdown } from '../../composables/index.js'

const props = defineProps({ message: Object })
const emit  = defineEmits(['feedback', 'sourceClick'])

const { renderMarkdown } = useMarkdown()

const renderedContent = computed(() =>
  renderMarkdown(props.message.content || '')
)

// Clic sur un badge [Source N] dans le markdown
function onContentClick(e) {
  const badge = e.target.closest('.source-badge')
  if (!badge) return
  const idx = parseInt(badge.dataset.source)
  const src  = props.message.sources?.find(s => s.index === idx)
  if (src) emit('sourceClick', src)
}
</script>

<style scoped>
.message {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  animation: fadeIn 0.2s var(--ease);
  border-bottom: 1px solid var(--border);
}
.message:last-child { border-bottom: none; }

/* ── Avatar ── */
.message-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.message--user .message-avatar {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.message--assistant .message-avatar {
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
}

.ai-dot { font-size: 11px; }

/* ── Body ── */
.message-body {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.message-text {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.7;
}

.message-text--user {
  color: var(--text-secondary);
  font-weight: 400;
}

.message--error .message-text {
  color: var(--error);
  font-style: italic;
}

/* ── Stream cursor ── */
.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: middle;
  border-radius: 1px;
  animation: blink 0.8s ease-in-out infinite;
}

/* ── Refined question badge ── */
.refined-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  margin-bottom: 10px;
}
.refined-badge em { color: var(--text-secondary); font-style: italic; }

/* ── Sources ── */
.sources-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.sources-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 180px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  cursor: pointer;
  transition: all 0.12s;
  font-family: var(--font-sans);
}
.source-chip:hover {
  border-color: var(--accent-dim);
  background: var(--accent-glow);
}

.source-chip-num {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.source-chip-title {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 110px;
}

.source-chip-score {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

/* ── Footer ── */
.message-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.latency {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.feedback-btns {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.feedback-btn {
  width: 26px; height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.feedback-btn:hover       { color: var(--success); border-color: var(--success); background: rgba(76,175,125,0.1); }
.feedback-btn.active      { color: var(--success); border-color: var(--success); background: rgba(76,175,125,0.15); }
.feedback-btn--down:hover { color: var(--error);   border-color: var(--error);   background: rgba(224,92,92,0.1); }
.feedback-btn--down.active{ color: var(--error);   border-color: var(--error);   background: rgba(224,92,92,0.15); }
</style>

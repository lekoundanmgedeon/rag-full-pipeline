<template>
  <div class="input-area">

    <!-- Error banner -->
    <Transition name="error-banner">
      <div v-if="error" class="error-banner">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
          <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        {{ error }}
      </div>
    </Transition>

    <div class="input-box" :class="{ focused, disabled }">
      <textarea
        ref="textareaEl"
        v-model="question"
        :disabled="disabled"
        placeholder="Posez votre question…"
        rows="1"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="onKeydown"
        @input="autoResize"
      />

      <div class="input-actions">
        <!-- Hint clavier -->
        <span class="keyboard-hint">
          <kbd>↵</kbd> Envoyer &nbsp;
          <kbd>⇧↵</kbd> Nouvelle ligne
        </span>

        <!-- Bouton envoyer -->
        <button
          class="btn-send"
          :class="{ active: question.trim() && !disabled }"
          :disabled="!question.trim() || disabled"
          @click="submit"
          title="Envoyer"
        >
          <svg v-if="!disabled" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-else class="spinner" />
        </button>
      </div>
    </div>

    <p class="input-disclaimer">
      Les réponses sont générées à partir de vos documents indexés uniquement.
    </p>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  error:    { type: String,  default: null  },
})
const emit = defineEmits(['submit'])

const question    = ref('')
const focused     = ref(false)
const textareaEl  = ref(null)

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

function submit() {
  const q = question.value.trim()
  if (!q || props.disabled) return
  question.value = ''
  nextTick(() => {
    autoResize()
    textareaEl.value?.focus()
  })
  emit('submit', q)
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 180) + 'px'
}
</script>

<style scoped>
.input-area {
  flex-shrink: 0;
  padding: 12px 24px 20px;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}

/* ── Error banner ── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: rgba(224, 92, 92, 0.12);
  border: 1px solid rgba(224, 92, 92, 0.3);
  color: var(--error);
  font-size: 13px;
  margin-bottom: 8px;
}

.error-banner-enter-active,
.error-banner-leave-active { transition: all 0.2s; }
.error-banner-enter-from,
.error-banner-leave-to     { opacity: 0; transform: translateY(4px); }

/* ── Input box ── */
.input-box {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 10px 10px 10px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input-box.focused {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 3px rgba(232,184,75,0.06);
}

.input-box.disabled {
  opacity: 0.6;
}

textarea {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  resize: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  min-height: 24px;
  max-height: 180px;
  overflow-y: auto;
  padding: 0;
}

textarea::placeholder {
  color: var(--text-muted);
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.keyboard-hint {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

kbd {
  display: inline-flex;
  align-items: center;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid var(--border-strong);
  background: var(--bg-elevated);
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

/* ── Send button ── */
.btn-send {
  width: 32px; height: 32px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.btn-send.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--text-inverse);
}

.btn-send:disabled { cursor: not-allowed; }
.btn-send.active:hover {
  background: #f0c85a;
  box-shadow: 0 2px 8px rgba(232,184,75,0.35);
}

/* ── Spinner ── */
.spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(0,0,0,0.2);
  border-top-color: var(--text-inverse);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* ── Disclaimer ── */
.input-disclaimer {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  margin-top: 8px;
}
</style>

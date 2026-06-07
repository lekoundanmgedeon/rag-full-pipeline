<template>
  <div class="source-panel">
    <div class="source-panel-inner">
      <div class="source-panel-header">
        <div class="source-meta">
          <span class="source-num">Source {{ source.index }}</span>
          <span class="source-type-badge">{{ fileTypeIcon(source.fileType) }} {{ source.fileType?.toUpperCase() }}</span>
        </div>
        <button class="btn-close" @click="$emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <h3 class="source-title">{{ source.title }}</h3>

      <div class="source-tags">
        <span v-if="source.page" class="tag">📄 Page {{ source.page }}</span>
        <span v-if="source.section" class="tag">§ {{ source.section }}</span>
        <span class="tag tag--score">{{ source.score }}% pertinence</span>
      </div>

      <div class="source-excerpt">
        <p>{{ source.excerpt }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useFileFormat } from '../../composables/index.js'
const { fileTypeIcon } = useFileFormat()
defineProps({ source: Object })
defineEmits(['close'])
</script>

<style scoped>
.source-panel {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: min(540px, calc(100% - 48px));
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  overflow: hidden;
}

.source-panel-inner { padding: 16px 18px; }

.source-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.source-meta { display: flex; align-items: center; gap: 8px; }

.source-num {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
}

.source-type-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
}

.btn-close {
  width: 26px; height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.source-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.source-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}

.tag {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.tag--score {
  color: var(--success);
  background: rgba(76,175,125,0.1);
  border-color: rgba(76,175,125,0.25);
}

.source-excerpt {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  max-height: 140px;
  overflow-y: auto;
}

.source-excerpt p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  font-style: italic;
}
</style>

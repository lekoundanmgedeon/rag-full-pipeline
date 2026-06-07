<template>
  <div
    class="conv-item"
    :class="{ active }"
    @click="$emit('select')"
  >
    <div class="conv-icon">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="conv-body">
      <span class="conv-title truncate">{{ conv.title || 'Conversation' }}</span>
      <span class="conv-date">{{ relativeTime(conv.updated_at) }}</span>
    </div>
    <button
      class="conv-delete"
      @click.stop="$emit('delete')"
      title="Supprimer"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { useRelativeTime } from '../../composables/index.js'
const { relativeTime } = useRelativeTime()

defineProps({ conv: Object, active: Boolean })
defineEmits(['select', 'delete'])
</script>

<style scoped>
.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
}
.conv-item:hover   { background: var(--bg-hover); }
.conv-item.active  { background: var(--bg-active); }
.conv-item:hover .conv-delete { opacity: 1; }

.conv-icon {
  flex-shrink: 0;
  color: var(--text-muted);
  margin-top: 1px;
}
.conv-item.active .conv-icon { color: var(--accent); }

.conv-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.conv-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 400;
  line-height: 1.4;
}
.conv-item.active .conv-title { color: var(--text-primary); font-weight: 500; }

.conv-date {
  font-size: 11px;
  color: var(--text-muted);
}

.conv-delete {
  flex-shrink: 0;
  width: 20px; height: 20px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: all 0.12s;
}
.conv-delete:hover {
  background: rgba(224, 92, 92, 0.15);
  color: var(--error);
  opacity: 1;
}
</style>

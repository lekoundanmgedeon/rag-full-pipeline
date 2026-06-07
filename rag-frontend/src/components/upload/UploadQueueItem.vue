<template>
  <div class="queue-item" :class="`queue-item--${item.status}`">

    <div class="queue-item-header">
      <span class="queue-filename truncate">{{ item.name }}</span>
      <button v-if="item.status === 'done' || item.status === 'error'"
        class="queue-close" @click="$emit('remove')">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Progress bar -->
    <div class="queue-progress-wrap" v-if="item.status !== 'done' && item.status !== 'error'">
      <div class="queue-progress-bar">
        <div class="queue-progress-fill" :style="{ width: item.progress + '%' }" />
      </div>
      <span class="queue-pct">{{ item.progress }}%</span>
    </div>

    <!-- Status label -->
    <div class="queue-status">
      <template v-if="item.status === 'uploading'">
        <span class="dot dot--blue" /> Envoi en cours…
      </template>
      <template v-else-if="item.status === 'indexing'">
        <span class="dot dot--amber" /> Indexation…
      </template>
      <template v-else-if="item.status === 'done'">
        <span class="dot dot--green" /> Indexé ✓
      </template>
      <template v-else-if="item.status === 'error'">
        <span class="dot dot--red" /> {{ item.error || 'Erreur' }}
      </template>
    </div>

  </div>
</template>

<script setup>
defineProps({ item: Object })
defineEmits(['remove'])
</script>

<style scoped>
.queue-item {
  padding: 7px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  font-size: 12px;
}

.queue-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.queue-filename {
  color: var(--text-primary);
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

.queue-close {
  flex-shrink: 0;
  width: 18px; height: 18px;
  border-radius: 3px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.queue-close:hover { color: var(--text-primary); background: var(--bg-hover); }

.queue-progress-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.queue-progress-bar {
  flex: 1;
  height: 3px;
  background: var(--bg-surface);
  border-radius: 2px;
  overflow: hidden;
}

.queue-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.queue-pct {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  min-width: 28px;
  text-align: right;
}

.queue-status {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 11px;
}

.dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot--blue  { background: var(--info);    animation: pulse 1.2s infinite; }
.dot--amber { background: var(--accent);  animation: pulse 1.2s infinite; }
.dot--green { background: var(--success); }
.dot--red   { background: var(--error);   }
</style>

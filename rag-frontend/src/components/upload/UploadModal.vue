<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal" @dragover.prevent @drop.prevent="onDrop">

        <!-- Header -->
        <div class="modal-header">
          <h2 class="modal-title">Ajouter des documents</h2>
          <button class="btn-close" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Drop zone -->
        <div
          class="drop-zone"
          :class="{ 'drop-zone--over': isDragging }"
          @dragenter.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
          @click="fileInput.click()"
        >
          <input
            ref="fileInput"
            type="file"
            multiple
            :accept="ACCEPTED"
            style="display:none"
            @change="onFileSelect"
          />

          <div class="drop-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="drop-text">
            Glissez vos fichiers ici ou <span class="drop-link">parcourez</span>
          </p>
          <p class="drop-hint">PDF, DOCX, XLSX, CSV, HTML, TXT — max {{ MAX_MB }} Mo</p>
        </div>

        <!-- File queue -->
        <TransitionGroup name="file-item" tag="div" class="file-list" v-if="pending.length">
          <div v-for="item in pending" :key="item.id" class="file-item">
            <span class="file-type-icon">{{ fileTypeIcon(item.ext) }}</span>
            <div class="file-info">
              <span class="file-name truncate">{{ item.file.name }}</span>
              <span class="file-size">{{ formatSize(item.file.size) }}</span>
            </div>
            <button class="file-remove" @click="removeFile(item.id)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </TransitionGroup>

        <!-- Errors -->
        <div v-if="errors.length" class="upload-errors">
          <div v-for="(e, i) in errors" :key="i" class="upload-error">
            {{ e }}
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn-cancel" @click="$emit('close')">Annuler</button>
          <button
            class="btn-upload"
            :disabled="!pending.length || isUploading"
            @click="startUpload"
          >
            <span v-if="isUploading" class="spinner-sm" />
            {{ isUploading ? 'Envoi...' : `Indexer ${pending.length || ''} fichier${pending.length > 1 ? 's' : ''}` }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref }          from 'vue'
import { useChatStore } from '../../stores/chatStore.js'
import { useFileFormat } from '../../composables/index.js'

const emit  = defineEmits(['close'])
const store = useChatStore()
const { formatSize, fileTypeIcon } = useFileFormat()

const MAX_MB   = parseInt(import.meta.env.VITE_MAX_FILE_MB || '50')
const ACCEPTED = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.html,.htm,.txt,.md'
const ALLOWED_EXTS = new Set(['pdf','docx','doc','xlsx','xls','csv','html','htm','txt','md'])

const fileInput  = ref(null)
const isDragging = ref(false)
const pending    = ref([])
const errors     = ref([])
const isUploading = ref(false)

function onDrop(e) {
  isDragging.value = false
  addFiles([...e.dataTransfer.files])
}

function onFileSelect(e) {
  addFiles([...e.target.files])
  e.target.value = ''
}

function addFiles(files) {
  errors.value = []
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase()

    if (!ALLOWED_EXTS.has(ext)) {
      errors.value.push(`${file.name} — format non supporté (.${ext})`)
      continue
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      errors.value.push(`${file.name} — fichier trop volumineux (max ${MAX_MB} Mo)`)
      continue
    }

    if (pending.value.some(p => p.file.name === file.name && p.file.size === file.size)) {
      continue // doublon
    }

    pending.value.push({ id: `f-${Date.now()}-${Math.random()}`, file, ext })
  }
}

function removeFile(id) {
  pending.value = pending.value.filter(p => p.id !== id)
}

async function startUpload() {
  if (!pending.value.length || isUploading.value) return
  isUploading.value = true

  const toUpload = [...pending.value]
  pending.value  = []

  await Promise.all(
    toUpload.map(item => store.uploadDocument(item.file))
  )

  isUploading.value = false
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s;
}

.modal {
  width: min(540px, calc(100vw - 32px));
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: fadeIn 0.2s var(--ease);
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}

.modal-title { font-size: 15px; font-weight: 500; }

.btn-close {
  width: 28px; height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

/* ── Drop zone ── */
.drop-zone {
  margin: 16px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 36px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.drop-zone:hover,
.drop-zone--over {
  border-color: var(--accent-dim);
  background: var(--accent-glow);
}

.drop-icon { color: var(--text-muted); margin-bottom: 12px; }
.drop-zone--over .drop-icon { color: var(--accent); }

.drop-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.drop-link { color: var(--accent); text-decoration: underline; }

.drop-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* ── File list ── */
.file-list {
  max-height: 220px;
  overflow-y: auto;
  margin: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.file-type-icon { font-size: 18px; flex-shrink: 0; }

.file-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
}

.file-name { font-size: 13px; color: var(--text-primary); }
.file-size { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }

.file-remove {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: var(--radius-sm);
  border: none; background: transparent;
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.file-remove:hover { color: var(--error); background: rgba(224,92,92,0.1); }

/* ── Errors ── */
.upload-errors { margin: 8px 16px 0; }
.upload-error {
  font-size: 12px;
  color: var(--error);
  padding: 4px 8px;
  background: rgba(224,92,92,0.08);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
}

/* ── Footer ── */
.modal-footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 10px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border);
  margin-top: 12px;
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.12s;
}
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-primary); }

.btn-upload {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-upload:hover:not(:disabled) { background: #f0c85a; }
.btn-upload:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner-sm {
  width: 13px; height: 13px;
  border: 2px solid rgba(0,0,0,0.2);
  border-top-color: var(--text-inverse);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Transitions */
.file-item-enter-active,
.file-item-leave-active { transition: all 0.2s; }
.file-item-enter-from   { opacity: 0; transform: translateY(-4px); }
.file-item-leave-to     { opacity: 0; height: 0; padding: 0; margin: 0; border: none; }
</style>

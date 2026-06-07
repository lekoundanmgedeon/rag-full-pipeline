/**
 * API Service — toutes les communications avec le backend RAG
 */

import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

// Injecter le JWT automatiquement
http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('rag_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Chat (SSE streaming) ─────────────────────────────────────────
/**
 * Envoie une question et retourne un ReadableStream SSE.
 * On utilise fetch (pas axios) pour le streaming natif.
 */
export async function sendChatMessage({ question, conversationId, filters = {} }) {
  const token = localStorage.getItem('rag_token')

  const response = await fetch('/api/chat', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ question, conversationId, filters }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erreur réseau' }))
    throw new Error(err.error || `HTTP ${response.status}`)
  }

  return response.body
}

/**
 * Parse un ReadableStream SSE et yield des événements typés.
 * Gère les chunks partiels et le buffer de lignes.
 */
export async function* parseSSEStream(readableStream) {
  const reader  = readableStream.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // garder le fragment incomplet

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue
        try {
          yield JSON.parse(data)
        } catch { /* ligne JSON incomplète */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Conversations ────────────────────────────────────────────────
export const conversationsApi = {
  list:    (params = {})    => http.get('/conversations', { params }),
  get:     (id)             => http.get(`/conversations/${id}`),
  delete:  (id)             => http.delete(`/conversations/${id}`),
}

// ── Messages ─────────────────────────────────────────────────────
export const messagesApi = {
  feedback: (id, feedback)  => http.post(`/messages/${id}/feedback`, { feedback }),
}

// ── Documents ────────────────────────────────────────────────────
export const documentsApi = {
  list:    (params = {})    => http.get('/documents', { params }),
  get:     (id)             => http.get(`/documents/${id}`),
  delete:  (id)             => http.delete(`/documents/${id}`),
  reindex: (id)             => http.post(`/documents/${id}/reindex`),

  /**
   * Upload avec progression via XMLHttpRequest (axios onUploadProgress).
   * Retourne la promesse + un cancel token.
   */
  upload(file, metadata = {}, onProgress) {
    const controller = new AbortController()
    const formData   = new FormData()
    formData.append('file',     file)
    formData.append('title',    metadata.title    || file.name.replace(/\.[^.]+$/, ''))
    formData.append('language', metadata.language || 'fr')
    if (metadata.tags?.length) {
      formData.append('tags', JSON.stringify(metadata.tags))
    }

    const promise = http.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: controller.signal,
      onUploadProgress: (evt) => {
        if (evt.total) onProgress?.(Math.round((evt.loaded / evt.total) * 100))
      },
    })

    return { promise, cancel: () => controller.abort() }
  },

  /**
   * Suivi temps réel du statut d'indexation via SSE.
   */
  watchStatus(documentId, onEvent) {
    const token = localStorage.getItem('rag_token')
    const url   = `/api/documents/${documentId}/status`

    // EventSource ne supporte pas les headers custom — on passe le token en query
    const es = new EventSource(`${url}?token=${token}`)
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)) } catch {}
    }
    es.onerror = () => es.close()
    return () => es.close()   // cleanup function
  },
}

// ── Search ───────────────────────────────────────────────────────
export const searchApi = {
  search: (query, opts = {}) => http.post('/search', { query, ...opts }),
}

// ── Stats ────────────────────────────────────────────────────────
export const statsApi = {
  get: () => http.get('/stats'),
}

// ── Auth helper (dev) ────────────────────────────────────────────
export function setToken(token) {
  localStorage.setItem('rag_token', token)
}
export function getToken() {
  return localStorage.getItem('rag_token')
}

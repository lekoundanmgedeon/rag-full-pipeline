/**
 * useChatStore — Pinia store principal
 *
 * Gère :
 *   - Conversations (liste + conversation courante)
 *   - Messages avec streaming token-par-token
 *   - Sources documentaires
 *   - État upload
 *   - Erreurs
 */

import { defineStore }       from 'pinia'
import { ref, computed }     from 'vue'
import { useRouter }         from 'vue-router'
import {
  sendChatMessage, parseSSEStream,
  conversationsApi, messagesApi, documentsApi,
} from '../services/api.js'

export const useChatStore = defineStore('chat', () => {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────
  const conversations     = ref([])          // liste sidebar
  const currentConvId     = ref(null)        // UUID conversation active
  const messages          = ref([])          // messages du chat actif
  const isStreaming       = ref(false)       // LLM en train de répondre
  const isLoadingConvs    = ref(false)       // chargement liste convs
  const isLoadingMessages = ref(false)       // chargement messages conv
  const error             = ref(null)        // erreur globale
  const streamError       = ref(null)        // erreur pendant stream

  // Upload documents
  const uploadQueue       = ref([])          // [{ id, file, status, progress, docId }]

  // ── Getters ────────────────────────────────────────────────────
  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConvId.value) || null
  )

  const lastAssistantMessage = computed(() => {
    const msgs = messages.value
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i]
    }
    return null
  })

  // ── Actions : Conversations ────────────────────────────────────

  async function loadConversations() {
    isLoadingConvs.value = true
    error.value = null
    try {
      const { data } = await conversationsApi.list({ limit: 50 })
      conversations.value = data.conversations
    } catch (err) {
      error.value = 'Impossible de charger les conversations'
    } finally {
      isLoadingConvs.value = false
    }
  }

  async function selectConversation(id) {
    if (currentConvId.value === id) return
    currentConvId.value = id
    messages.value      = []
    streamError.value   = null

    isLoadingMessages.value = true
    try {
      const { data } = await conversationsApi.get(id)
      messages.value = data.messages.map(m => ({
        ...m,
        sources:  m.sources  || [],
        feedback: m.feedback || null,
      }))
      router.push(`/c/${id}`)
    } catch {
      error.value = 'Impossible de charger la conversation'
    } finally {
      isLoadingMessages.value = false
    }
  }

  function newConversation() {
    currentConvId.value = null
    messages.value      = []
    streamError.value   = null
    router.push('/')
  }

  async function deleteConversation(id) {
    await conversationsApi.delete(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (currentConvId.value === id) newConversation()
  }

  // ── Actions : Chat / Streaming ─────────────────────────────────

  async function sendMessage(question) {
    if (!question.trim() || isStreaming.value) return

    streamError.value = null

    // 1. Ajouter le message utilisateur immédiatement
    messages.value.push({
      id:      `tmp-user-${Date.now()}`,
      role:    'user',
      content: question,
      created_at: new Date().toISOString(),
    })

    // 2. Préparer le message assistant (streaming)
    const assistantMsg = {
      id:        `tmp-assistant-${Date.now()}`,
      role:      'assistant',
      content:   '',
      sources:   [],
      feedback:  null,
      streaming: true,
      created_at: new Date().toISOString(),
    }
    messages.value.push(assistantMsg)

    isStreaming.value = true

    try {
      const stream = await sendChatMessage({
        question,
        conversationId: currentConvId.value,
      })

      for await (const event of parseSSEStream(stream)) {
        switch (event.type) {

          case 'meta':
            // Créer/mettre à jour la conversation
            if (!currentConvId.value) {
              currentConvId.value = event.conversationId
              router.push(`/c/${event.conversationId}`)
              // Ajouter en tête de la sidebar
              conversations.value.unshift({
                id:         event.conversationId,
                title:      question.slice(0, 60),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            }
            // Attacher les sources au message assistant
            assistantMsg.sources          = event.sources || []
            assistantMsg.refinedQuestion  = event.refinedQuestion
            break

          case 'token':
            assistantMsg.content += event.content
            break

          case 'done':
            assistantMsg.streaming = false
            assistantMsg.latencyMs = event.latencyMs
            // Mettre à jour le titre dans la sidebar si c'est la première question
            _updateSidebarTitle(currentConvId.value, question)
            break

          case 'error':
            streamError.value      = event.message
            assistantMsg.streaming = false
            assistantMsg.isError   = true
            assistantMsg.content   = event.message
            break
        }
      }
    } catch (err) {
      streamError.value      = err.message === 'Failed to fetch'
        ? 'Impossible de contacter le serveur. Vérifiez votre connexion.'
        : err.message
      assistantMsg.streaming = false
      assistantMsg.isError   = true
      assistantMsg.content   = streamError.value
    } finally {
      isStreaming.value      = false
      assistantMsg.streaming = false
    }
  }

  // ── Actions : Feedback ─────────────────────────────────────────

  async function sendFeedback(messageId, feedback) {
    // Optimistic update
    const msg = messages.value.find(m => m.id === messageId)
    if (msg) msg.feedback = feedback

    try {
      await messagesApi.feedback(messageId, feedback)
    } catch {
      // Rollback
      if (msg) msg.feedback = null
    }
  }

  // ── Actions : Upload ───────────────────────────────────────────

  async function uploadDocument(file, metadata = {}) {
    const uploadId = `upload-${Date.now()}`
    const item = {
      id:       uploadId,
      file,
      name:     file.name,
      size:     file.size,
      status:   'uploading',  // uploading | indexing | done | error
      progress: 0,
      docId:    null,
      error:    null,
    }
    uploadQueue.value.push(item)

    try {
      // Phase 1 : upload HTTP
      const { promise } = documentsApi.upload(file, metadata, (pct) => {
        item.progress = Math.round(pct * 0.5)  // 0→50%
      })
      const { data } = await promise
      item.docId  = data.document.id
      item.status = 'indexing'
      item.progress = 50

      // Phase 2 : suivi indexation SSE
      await new Promise((resolve) => {
        const cleanup = documentsApi.watchStatus(item.docId, (event) => {
          item.progress = 50 + Math.round((event.progress || 0) * 0.5) // 50→100%
          if (event.status === 'done' || event.status === 'failed') {
            item.status   = event.status === 'done' ? 'done' : 'error'
            item.progress = event.status === 'done' ? 100 : item.progress
            item.error    = event.error || null
            cleanup()
            resolve()
          }
        })
        // Timeout de sécurité : 5 minutes
        setTimeout(() => { cleanup(); resolve() }, 5 * 60 * 1000)
      })

    } catch (err) {
      item.status = 'error'
      item.error  = err.response?.data?.error || err.message
    }
  }

  function removeFromQueue(uploadId) {
    uploadQueue.value = uploadQueue.value.filter(u => u.id !== uploadId)
  }

  // ── Helpers privés ─────────────────────────────────────────────

  function _updateSidebarTitle(convId, question) {
    const conv = conversations.value.find(c => c.id === convId)
    if (conv && conv.title === question.slice(0, 60)) return
    if (conv) conv.updated_at = new Date().toISOString()
  }

  return {
    // State
    conversations, currentConvId, messages,
    isStreaming, isLoadingConvs, isLoadingMessages,
    error, streamError, uploadQueue,
    // Getters
    currentConversation, lastAssistantMessage,
    // Actions
    loadConversations, selectConversation,
    newConversation, deleteConversation,
    sendMessage, sendFeedback,
    uploadDocument, removeFromQueue,
  }
})

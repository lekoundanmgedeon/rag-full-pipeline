/**
 * Composables réutilisables
 */

import { ref, watch, nextTick } from 'vue'
import { marked }   from 'marked'
import DOMPurify    from 'dompurify'

// ── useAutoScroll ────────────────────────────────────────────────
/**
 * Auto-scroll vers le bas d'un conteneur.
 * S'arrête si l'utilisateur a scrollé manuellement vers le haut.
 */
export function useAutoScroll(containerRef) {
  const isAtBottom   = ref(true)
  const isUserScrolling = ref(false)

  function onScroll() {
    const el = containerRef.value
    if (!el) return
    const threshold = 80
    isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  async function scrollToBottom(force = false) {
    if (!force && !isAtBottom.value) return
    await nextTick()
    const el = containerRef.value
    if (el) el.scrollTop = el.scrollHeight
  }

  return { isAtBottom, onScroll, scrollToBottom }
}

// ── useMarkdown ──────────────────────────────────────────────────
/**
 * Convertit le markdown en HTML sécurisé (DOMPurify).
 * Configure marked pour les blocs de code et les citations.
 */

// Configuration marked
marked.setOptions({ breaks: true, gfm: true })

// Renderer custom pour les sources [Source N]
const renderer = new marked.Renderer()
const originalParagraph = renderer.paragraph.bind(renderer)
renderer.paragraph = (token) => {
  // Convertir [Source N] en badge cliquable
  const html = typeof token === 'string' ? token : token.text
  if (!html) return originalParagraph(token)
  const withBadges = html.replace(
    /\[Source\s+(\d+)\]/g,
    '<span class="source-badge" data-source="$1">[Source $1]</span>'
  )
  return `<p>${withBadges}</p>`
}
marked.use({ renderer })

export function useMarkdown() {
  function renderMarkdown(text) {
    if (!text) return ''
    const html = marked.parse(text)
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p','br','strong','em','b','i','u','s',
        'h1','h2','h3','h4','h5','h6',
        'ul','ol','li',
        'blockquote','pre','code',
        'table','thead','tbody','tr','th','td',
        'a','span',
      ],
      ALLOWED_ATTR: ['href','target','class','data-source'],
    })
  }

  return { renderMarkdown }
}

// ── useFileFormat ────────────────────────────────────────────────
export function useFileFormat() {
  function formatSize(bytes) {
    if (bytes < 1024)        return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  function fileTypeIcon(type) {
    const icons = {
      pdf:  '📄', docx: '📝', doc: '📝',
      xlsx: '📊', xls: '📊', csv: '📊',
      html: '🌐', htm: '🌐',
      txt:  '📃', md:  '📃',
    }
    return icons[type?.toLowerCase()] || '📎'
  }

  function fileTypeColor(type) {
    const colors = {
      pdf:  '#e74c3c', docx: '#2980b9', doc: '#2980b9',
      xlsx: '#27ae60', xls: '#27ae60', csv: '#27ae60',
      html: '#e67e22', txt: '#95a5a6', md: '#95a5a6',
    }
    return colors[type?.toLowerCase()] || '#7f8c8d'
  }

  return { formatSize, fileTypeIcon, fileTypeColor }
}

// ── useRelativeTime ──────────────────────────────────────────────
export function useRelativeTime() {
  function relativeTime(dateStr) {
    if (!dateStr) return ''
    const date  = new Date(dateStr)
    const now   = new Date()
    const diffS = Math.floor((now - date) / 1000)

    if (diffS < 60)           return "À l'instant"
    if (diffS < 3600)         return `Il y a ${Math.floor(diffS / 60)} min`
    if (diffS < 86400)        return `Il y a ${Math.floor(diffS / 3600)} h`
    if (diffS < 86400 * 7)   return `Il y a ${Math.floor(diffS / 86400)} j`
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return { relativeTime }
}

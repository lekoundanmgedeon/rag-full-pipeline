<template>
  <div class="app-shell">
    <AppSidebar v-if="!isLogin" />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import AppSidebar from './components/layout/AppSidebar.vue'
import { useChatStore } from './stores/chatStore.js'
import { onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { getToken } from './services/api.js'

const store = useChatStore()
const route = useRoute()
const isLogin = computed(() => route.path === '/login')
const isAuthenticated = computed(() => Boolean(getToken()))

onMounted(() => {
  if (!isLogin.value && isAuthenticated.value) {
    store.loadConversations()
  }
})

watch([isLogin, isAuthenticated], ([login, auth]) => {
  if (!login && auth) {
    store.loadConversations()
  }
})
</script>

<style>
/* ═══════════════════════════════════════════════════════════════
   DESIGN SYSTEM — RAG Assistant
   Aesthetic : Refined dark editorial. DM Sans + DM Mono.
   Palette   : Near-black background, warm ivory text, amber accent.
   ═══════════════════════════════════════════════════════════════ */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Couleurs */
  --bg-app:        #0f0f0f;
  --bg-sidebar:    #141414;
  --bg-surface:    #1a1a1a;
  --bg-elevated:   #222222;
  --bg-hover:      #252525;
  --bg-active:     #2a2a2a;

  --text-primary:   #f0ece3;
  --text-secondary: #8a8580;
  --text-muted:     #555;
  --text-inverse:   #0f0f0f;

  --accent:        #e8b84b;     /* Ambre chaud */
  --accent-dim:    #7a5e1a;
  --accent-glow:   rgba(232, 184, 75, 0.12);

  --border:        rgba(255,255,255,0.07);
  --border-strong: rgba(255,255,255,0.14);

  --success:    #4caf7d;
  --error:      #e05c5c;
  --warning:    #e8a44b;
  --info:       #5c9de0;

  /* Typographie */
  --font-sans:  'DM Sans', system-ui, sans-serif;
  --font-mono:  'DM Mono', 'Courier New', monospace;

  /* Espacements */
  --radius-sm:  6px;
  --radius-md:  10px;
  --radius-lg:  16px;
  --radius-xl:  24px;

  /* Shadows */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.5);
  --shadow-lg:  0 8px 32px rgba(0,0,0,0.6);

  /* Sidebar */
  --sidebar-w:  260px;

  /* Transitions */
  --ease:       cubic-bezier(0.16, 1, 0.3, 1);
}

html, body {
  height: 100%;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

#app { height: 100%; }

.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* ── Selection ── */
::selection { background: var(--accent-dim); color: var(--text-primary); }

/* ── Focus ── */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* ── Utilities ── */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

/* ── Source badges (dans les réponses markdown) ── */
.source-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: background 0.15s;
}
.source-badge:hover {
  background: rgba(232, 184, 75, 0.2);
}

/* ── Markdown rendering ── */
.markdown-body { line-height: 1.7; }
.markdown-body p { margin-bottom: 0.75rem; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body h1,.markdown-body h2,.markdown-body h3 {
  font-weight: 600; margin: 1.25rem 0 0.5rem; color: var(--text-primary);
}
.markdown-body h1 { font-size: 1.2em; }
.markdown-body h2 { font-size: 1.1em; }
.markdown-body h3 { font-size: 1em; }
.markdown-body ul,.markdown-body ol { padding-left: 1.4rem; margin-bottom: 0.75rem; }
.markdown-body li { margin-bottom: 0.2rem; }
.markdown-body blockquote {
  border-left: 3px solid var(--accent-dim);
  padding-left: 1rem; margin: 0.75rem 0;
  color: var(--text-secondary);
  font-style: italic;
}
.markdown-body code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--bg-elevated);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--accent);
}
.markdown-body pre {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.markdown-body pre code {
  background: none; padding: 0; color: var(--text-primary);
}
.markdown-body table {
  width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9em;
}
.markdown-body th {
  padding: 6px 10px; text-align: left;
  border-bottom: 1px solid var(--border-strong);
  color: var(--text-secondary); font-weight: 500;
}
.markdown-body td {
  padding: 6px 10px; border-bottom: 1px solid var(--border);
}
.markdown-body strong { font-weight: 600; color: var(--text-primary); }

/* ── Animations ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes blink {
  0%,100% { opacity: 1; }
  50%      { opacity: 0; }
}
</style>

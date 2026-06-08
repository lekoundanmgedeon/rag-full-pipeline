<template>
  <div class="login-shell">
    <div class="login-card">
      <div class="brand">
        <span class="brand-icon">◆</span>
        <div>
          <h1>RAG Assistant</h1>
          <p>Connectez-vous pour discuter et importer vos documents.</p>
        </div>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <label>
          Email
          <input type="email" v-model="email" placeholder="test@example.com" required />
        </label>

        <label>
          Mot de passe
          <input type="password" v-model="password" placeholder="password" required />
        </label>

        <button class="btn-primary" type="submit" :disabled="loading">
          {{ loading ? 'Connexion...' : 'Se connecter' }}
        </button>

        <div class="login-hint">
          Utilisez <strong>test@example.com</strong> / <strong>password</strong> pour la session de développement.
        </div>

        <div class="divider">OU</div>

        <button type="button" class="btn-secondary" @click="handleDevLogin" :disabled="loading">
          Connexion dev rapide
        </button>

        <p v-if="error" class="error-message">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginDev, AUTH_DEFAULTS } from '../services/api.js'

const router = useRouter()
const email = ref(AUTH_DEFAULTS.email)
const password = ref(AUTH_DEFAULTS.password)
const error = ref(null)
const loading = ref(false)

function handleLogin() {
  error.value = null
  loading.value = true

  setTimeout(() => {
    const success = loginDev({ email: email.value, password: password.value })
    if (success) {
      router.push('/')
    } else {
      error.value = 'Identifiants invalides. Vérifiez votre email et mot de passe.'
    }
    loading.value = false
  }, 250)
}

function handleDevLogin() {
  error.value = null
  loading.value = true

  setTimeout(() => {
    loginDev({ token: AUTH_DEFAULTS.token })
    router.push('/')
    loading.value = false
  }, 150)
}
</script>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: radial-gradient(circle at top, rgba(232, 184, 75, 0.05), transparent 30%),
              radial-gradient(circle at bottom right, rgba(232, 184, 75, 0.08), transparent 25%),
              var(--bg-app);
}

.login-card {
  width: min(420px, 100%);
  padding: 2rem;
  border-radius: var(--radius-xl);
  background: rgba(26, 26, 26, 0.96);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: var(--shadow-lg);
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--text-inverse);
  font-weight: 700;
}

.brand h1 {
  font-size: 1.4rem;
  margin-bottom: 0.25rem;
}

.brand p {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.login-form {
  display: grid;
  gap: 1rem;
}

.login-form label {
  display: grid;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.login-form input {
  width: 100%;
  padding: 0.95rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255,255,255,0.08);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.login-form input:focus {
  border-color: var(--accent);
}

.btn-primary,
.btn-secondary {
  width: 100%;
  padding: 0.95rem 1rem;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary {
  background: var(--accent);
  color: var(--text-inverse);
}

.btn-secondary {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-hint {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.5;
}

.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-transform: uppercase;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.08);
}

.error-message {
  color: var(--error);
  font-size: 0.9rem;
}
</style>
/**
 * Sécurité — Sanitization des inputs utilisateur
 *
 * Protection contre :
 *   - Prompt injection
 *   - Jailbreak
 *   - SQL injection via les paramètres texte
 *   - XSS dans les réponses
 */

import { logger } from './logger.js';

// ── Patterns de prompt injection ─────────────────────────────────
const INJECTION_PATTERNS = [
  // Tentatives de reset/override du prompt système
  /ignore\s+(previous|all|your)\s+instructions?/gi,
  /forget\s+(your|all|previous|the)\s+(instructions?|rules?|context)/gi,
  /you\s+are\s+now\s+(a\s+)?(\w+)/gi,
  /act\s+as\s+(if\s+you\s+are\s+)?a?\s*(\w+)/gi,
  /new\s+persona/gi,
  /system\s*:\s*you/gi,
  /\[system\]/gi,
  /###\s*system/gi,

  // Tentatives d'extraction du prompt système
  /reveal\s+(your|the)\s+(system\s+)?prompt/gi,
  /what\s+(are\s+your|is\s+your)\s+(instructions?|prompt|rules?)/gi,
  /print\s+(your\s+)?(system\s+)?prompt/gi,
  /show\s+(me\s+)?your\s+(instructions?|prompt)/gi,

  // Tentatives de jailbreak classiques
  /DAN\s*(mode|prompt)?/gi,
  /jailbreak/gi,
  /bypass\s+(your|all|the)\s+(restrictions?|rules?|filters?)/gi,
  /without\s+(any\s+)?(restrictions?|limitations?|filters?)/gi,
  /pretend\s+(you\s+)?(don'?t\s+have|have\s+no)\s+(restrictions?|rules?)/gi,
];

// ── Patterns suspects (warning sans blocage) ──────────────────────
const SUSPICIOUS_PATTERNS = [
  /\bSQL\b.*\b(DROP|DELETE|INSERT|UPDATE|SELECT)\b/gi,
  /<script[\s\S]*?>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,    // onerror=, onclick=, etc.
];

/**
 * Sanitize une question utilisateur.
 * Lève une erreur si injection détectée, retourne le texte nettoyé sinon.
 */
export function sanitizeQuestion(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Question invalide');
  }

  const trimmed = text.trim();

  // Longueur maximale
  if (trimmed.length > 2000) {
    throw new Error('Question trop longue (max 2000 caractères)');
  }

  if (trimmed.length < 2) {
    throw new Error('Question trop courte');
  }

  // Détection d'injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn('Prompt injection detected', {
        pattern: pattern.toString(),
        text: trimmed.slice(0, 100),
      });
      throw new Error('Contenu non autorisé détecté dans la question');
    }
  }

  // Log des patterns suspects (sans bloquer)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.warn('Suspicious pattern in question', {
        pattern: pattern.toString(),
        text: trimmed.slice(0, 100),
      });
    }
  }

  // Nettoyage HTML basique (XSS)
  return trimmed
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize le contenu d'une réponse LLM avant envoi au frontend.
 * Supprime les éventuelles balises HTML injectées par le LLM.
 */
export function sanitizeResponse(text) {
  if (!text) return '';
  // Permettre le markdown mais bloquer le HTML brut
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Valide un UUID v4.
 */
export function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

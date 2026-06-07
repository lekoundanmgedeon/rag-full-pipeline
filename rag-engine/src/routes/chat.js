/**
 * Routes chat : /api/chat, /api/conversations, /api/messages
 */

import express       from 'express';
import rateLimit     from 'express-rate-limit';
import { ChatController } from '../controllers/chatController.js';
import { authenticate, tenantIsolation } from '../middlewares/auth.js';

const router   = express.Router();
const chatCtrl = new ChatController();

// ── Rate limiting ────────────────────────────────────────────────
// 20 questions / minute par utilisateur
const chatLimiter = rateLimit({
  windowMs:        60_000,
  max:             20,
  keyGenerator:    (req) => req.user?.id || req.ip,
  message:         { error: 'Trop de requêtes. Attendez 1 minute.' },
  standardHeaders: true,
  legacyHeaders:   false,
  // Exclure les OPTIONS (CORS preflight)
  skip: (req) => req.method === 'OPTIONS',
});

// Toutes les routes nécessitent auth + tenant
router.use(authenticate, tenantIsolation);

// ── Chat ─────────────────────────────────────────────────────────
router.post('/chat',      chatLimiter, chatCtrl.chat);

// ── Conversations ────────────────────────────────────────────────
router.get   ('/conversations',      chatCtrl.listConversations);
router.get   ('/conversations/:id',  chatCtrl.getConversation);
router.delete('/conversations/:id',  chatCtrl.deleteConversation);

// ── Messages ─────────────────────────────────────────────────────
router.post('/messages/:id/feedback', chatCtrl.saveFeedback);

// ── Stats ────────────────────────────────────────────────────────
router.get('/stats', chatCtrl.getStats);

export default router;

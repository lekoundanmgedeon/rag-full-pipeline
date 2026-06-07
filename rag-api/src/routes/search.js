import express from 'express';
import rateLimit from 'express-rate-limit';
import { SearchController } from '../controllers/searchController.js';
import { authenticate, tenantIsolation } from '../middlewares/auth.js';

const router     = express.Router();
const searchCtrl = new SearchController();

const searchLimiter = rateLimit({
  windowMs:     60_000,
  max:          60,
  keyGenerator: (req) => req.user?.id || req.ip,
  message:      { error: 'Trop de requêtes.' },
});

router.use(authenticate, tenantIsolation);

router.post('/search', searchLimiter, searchCtrl.search);

export default router;

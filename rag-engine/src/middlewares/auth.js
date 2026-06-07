import jwt from 'jsonwebtoken';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.user = {
      id:       decoded.sub,
      tenantId: decoded.tenantId || '00000000-0000-0000-0000-000000000001',
      email:    decoded.email,
      roles:    decoded.roles || ['user'],
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

export const tenantIsolation = (req, res, next) => {
  if (!req.user?.tenantId) return res.status(403).json({ error: 'Tenant non identifié' });
  req.tenantId = req.user.tenantId;
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  const ok = roles.some(r => req.user?.roles?.includes(r));
  if (!ok) return res.status(403).json({ error: 'Permission insuffisante' });
  next();
};

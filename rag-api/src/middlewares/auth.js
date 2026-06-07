import jwt from 'jsonwebtoken'
import 'dotenv/config'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' })
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET)
    req.user = {
      id:       decoded.sub,
      tenantId: decoded.tenantId || '00000000-0000-0000-0000-000000000001',
      email:    decoded.email,
      roles:    decoded.roles || ['user'],
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}

export const tenantIsolation = (req, res, next) => {
  if (!req.user?.tenantId)
    return res.status(403).json({ error: 'Tenant non identifié' })
  req.tenantId = req.user.tenantId
  next()
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.some(r => req.user?.roles?.includes(r)))
    return res.status(403).json({ error: 'Permission insuffisante' })
  next()
}

export const handleMulterError = (err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: `Fichier trop volumineux (max ${process.env.MAX_FILE_SIZE_MB || 50} Mo)` })
  if (err?.message?.includes('Type de fichier'))
    return res.status(415).json({ error: err.message })
  next(err)
}

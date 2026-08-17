import { verifySession } from './session.js';

// Guards /api/admin/*. Structurally separate from the agent's auth
// (backend/src/agent/auth.js) — different token format, different secret
// role, different failure modes. The agent's static API key is never
// accepted here, and this session token is never accepted by /api/agent/*:
// there is no code path that lets the agent authenticate as an admin.
export function requireAdminAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match ? match[1].trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão ausente. Faça login novamente.' });
  }
  let decoded;
  try {
    decoded = verifySession(token);
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
  if (!decoded.is_admin) {
    return res.status(403).json({ error: 'forbidden', message: 'Sua conta não tem permissão de administrador.' });
  }
  req.adminUser = { id: decoded.sub, email: decoded.email };
  next();
}

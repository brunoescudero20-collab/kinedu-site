import crypto from 'node:crypto';
import { env } from '../config/env.js';

// A single static bearer key, compared via a fixed-length hash so that
// (a) mismatched lengths never leak through timingSafeEqual, and
// (b) the comparison itself is constant-time.
//
// Why not OAuth/JWT here: there is exactly one trusted caller (the
// research agent, run by the same operator as this backend), calling a
// backend it already has a direct line to. A rotatable static secret
// compared safely is proportionate to that — token issuance, refresh
// flows, and expiry only pay for themselves once there's more than one
// caller or a real compromise scenario to contain. Recommended upgrade
// path once that changes: short-lived signed tokens (e.g. a JWT minted by
// a small `/api/agent/token` exchange endpoint) instead of a long-lived key.
function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest();
}

export function requireAgentAuth(req, res, next) {
  if (!env.agentApiKey) {
    return res.status(503).json({
      error: 'agent_api_disabled',
      message: 'A API do agente não está configurada (defina KINEDU_AGENT_API_KEY).',
    });
  }
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const provided = match ? match[1].trim() : '';
  const ok = provided.length > 0 && crypto.timingSafeEqual(sha256(provided), sha256(env.agentApiKey));
  if (!ok) {
    return res.status(401).json({ error: 'unauthorized', message: 'Credencial do agente ausente ou inválida.' });
  }
  next();
}

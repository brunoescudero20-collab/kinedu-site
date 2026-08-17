import crypto from 'node:crypto';
import { env } from '../config/env.js';

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest();
}

// Bearer-token auth, same pattern as backend/src/agent/auth.js — a
// separate secret (MCP_AUTH_SECRET), compared via crypto.timingSafeEqual
// over a SHA-256 hash of both sides.
//
// Why not OAuth: the MCP spec's reference auth model is OAuth 2.1, and the
// SDK ships client-side support for it — but running an authorization
// server (client registration, consent, token issuance/refresh) only pays
// for itself once there's more than one MCP client or untrusted callers to
// contain. This MCP endpoint has exactly one intended caller (a
// Claude/Cowork custom connector configured by the same operator who runs
// this backend), reachable only with a secret they generate and hold —
// the same proportionality argument already documented for the Agent API
// in docs/agent-api.md. If a second, less-trusted caller ever needs
// access, that's the point to implement OAuth for real rather than
// stretch this token further.
export function requireMcpAuth(req, res, next) {
  if (!env.mcpAuthSecret) {
    return res.status(503).json({ error: 'mcp_disabled', message: 'O MCP do KinEdu não está configurado (defina MCP_AUTH_SECRET).' });
  }
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const provided = match ? match[1].trim() : '';
  const ok = provided.length > 0 && crypto.timingSafeEqual(sha256(provided), sha256(env.mcpAuthSecret));
  if (!ok) {
    return res.status(401).json({ error: 'unauthorized', message: 'Credencial do MCP ausente ou inválida.' });
  }
  next();
}

import 'dotenv/config';
import crypto from 'node:crypto';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: required('DATABASE_URL'),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:8080').split(',').map((s) => s.trim()),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  // Optional on purpose: if unset, /api/agent/* responds 503 instead of
  // crashing the whole server — the public site must keep working even
  // when the agent side isn't configured yet.
  agentApiKey: process.env.KINEDU_AGENT_API_KEY || null,
  // Signs admin session tokens (see backend/src/admin/auth.js). If unset we
  // generate a random one at boot instead of crashing — admin login still
  // works, but every token becomes invalid on the next restart (logged as
  // a warning). Set SESSION_SECRET for tokens that survive a restart.
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  sessionSecretIsEphemeral: !process.env.SESSION_SECRET,
  // Separate credential from KINEDU_AGENT_API_KEY on purpose — the MCP
  // endpoint is a different network-facing surface (meant for a remote
  // Claude/Cowork connector) than direct Agent API calls. If one leaks, the
  // other still doesn't. Optional: /mcp responds 503 instead of crashing
  // the server when unset.
  mcpAuthSecret: process.env.MCP_AUTH_SECRET || null,
};

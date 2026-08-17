import 'dotenv/config';

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
};

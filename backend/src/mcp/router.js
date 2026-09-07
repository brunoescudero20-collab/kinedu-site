import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requireMcpAuth } from './auth.js';
import { mcpRateLimit } from './rateLimiter.js';
import { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from './server.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const mcpRouter = Router();

// sessionId -> { transport, server }. Follows the SDK's own documented
// pattern for a stateful Streamable HTTP server: one McpServer + transport
// per client session, kept alive across requests via the mcp-session-id
// header. In-memory, per-process — same documented limitation as the rate
// limiters (backend/src/utils/rateLimiter.js): fine for a single backend
// instance, would need external session storage before scaling out.
const sessions = new Map();

// GET /mcp/health — deliberately NOT behind requireMcpAuth (same
// convention as GET /api/health): a health probe has to work without a
// secret, and reports no configuration values, only booleans/counts.
mcpRouter.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (err) {
    logger.error('MCP health check: DB query failed', { message: err.message });
  }
  res.json({
    ok: dbOk && !!env.mcpAuthSecret,
    server: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    mcp_configured: !!env.mcpAuthSecret,
    database_connected: dbOk,
    active_sessions: sessions.size,
  });
});

mcpRouter.post('/', requireMcpAuth, mcpRateLimit, async (req, res) => {
  const sessionId = req.get('mcp-session-id');
  let entry = sessionId ? sessions.get(sessionId) : undefined;

  if (!entry) {
    if (sessionId) {
      // A session id was given but we don't recognize it — expired or the
      // process restarted since it was issued.
      return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Sessão desconhecida ou expirada. Reinicie a conexão MCP.' }, id: null });
    }
    if (!isInitializeRequest(req.body)) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: nenhum session ID válido fornecido.' }, id: null });
    }
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { sessions.set(sid, { transport, server }); },
    });
    entry = { transport, server };
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
  }

  await entry.transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(req, res) {
  const sessionId = req.get('mcp-session-id');
  const entry = sessionId ? sessions.get(sessionId) : undefined;
  if (!entry) return res.status(400).send('Sessão MCP inválida ou ausente.');
  await entry.transport.handleRequest(req, res);
}

mcpRouter.get('/', requireMcpAuth, mcpRateLimit, handleSessionRequest);
mcpRouter.delete('/', requireMcpAuth, mcpRateLimit, handleSessionRequest);

import { pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Every MCP tool call is logged into the same agent_audit_log table the
// Agent API uses (not a new table — this is exactly the "calls the agent
// surface makes" the table already exists for), with operation names
// prefixed "mcp:<toolName>" so entries are distinguishable by origin.
// Called explicitly from each tool handler (not as Express middleware,
// since a single POST /mcp request can trigger any tool depending on the
// JSON-RPC payload — there's no per-tool route to hang middleware off of).
export function logMcpToolCall({ tool, result, recordCount, runId, error }) {
  pool.query(
    `INSERT INTO agent_audit_log (endpoint, method, operation, result, record_count, run_id, status_code, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['/mcp', 'TOOL', `mcp:${tool}`, result, recordCount ?? null, runId ?? null, result === 'success' ? 200 : 500, error || null],
  ).catch((err) => logger.error('Failed to write MCP audit log', { message: err.message }));
}

import { pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Persists one row per agent call into agent_audit_log. Route handlers set
// res.locals.operation / recordCount / runId / errorMessage before
// responding; this middleware just reads those on 'finish' and writes them
// — it never sees or stores the API key, and never blocks the response
// (the insert happens after the response has already been sent).
export function agentAuditLog(req, res, next) {
  res.on('finish', () => {
    const operation = res.locals.operation || `${req.method} ${req.path}`;
    const result = res.statusCode < 400 ? 'success' : 'error';
    pool.query(
      `INSERT INTO agent_audit_log (endpoint, method, operation, result, record_count, run_id, status_code, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.path,
        req.method,
        operation,
        result,
        res.locals.recordCount ?? null,
        res.locals.runId ?? null,
        res.statusCode,
        res.statusCode >= 400 ? (res.locals.errorMessage || null) : null,
      ],
    ).catch((err) => logger.error('Failed to write agent audit log', { message: err.message }));
  });
  next();
}

import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

pool.on('error', (err) => {
  // Idle client errors (e.g. connection dropped) — log and let the pool recover.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'pg pool error', meta: { error: err.message } }));
});

import { pool } from '../../db/pool.js';

// agent_state: a small persistent key/value store so the scheduled tasks
// (A/B/C/D) can hand off information to each other across independent
// runs without relying on any one process's memory (item 23). Not a
// general-purpose cache — just enough for "priorities Task A computed",
// "diagnostic Task C last wrote", etc.

export async function getState(key) {
  const { rows } = await pool.query('SELECT key, value, updated_at FROM agent_state WHERE key = $1', [key]);
  return rows[0] || null;
}

export async function setState(key, value) {
  const { rows } = await pool.query(
    `INSERT INTO agent_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING key, value, updated_at`,
    [key, JSON.stringify(value)],
  );
  return rows[0];
}

export async function listStateKeys() {
  const { rows } = await pool.query('SELECT key, updated_at FROM agent_state ORDER BY updated_at DESC');
  return rows;
}

import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export const analyticsRouter = Router();

// POST /api/analytics/search — logs a query. user_id is optional (anonymous
// searches are logged as NULL, never blocked on having an account) and we
// deliberately store nothing beyond the query text itself — no IP, no
// user-agent — since the spec asks not to keep personal data we don't need.
analyticsRouter.post('/search', async (req, res) => {
  const { query, userId } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'validation_error', message: 'query é obrigatório.' });
  }
  try {
    await pool.query('INSERT INTO searches (user_id, query) VALUES ($1, $2)', [userId || null, query.trim()]);
    res.status(201).json({ ok: true });
  } catch (err) {
    // A real failure — reported honestly as 500. Analytics must never break
    // the feature it's measuring, but that guarantee belongs on the caller's
    // side (script.js fires this without awaiting it before rendering),
    // not by having the endpoint lie about its own status.
    logger.error('Failed to log search', { error: err.message });
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// POST /api/analytics/article-view — logs a view. Same fire-and-forget
// posture: the frontend calls this without awaiting it before rendering the
// article (see script.js), so a DB hiccup here can never block reading.
analyticsRouter.post('/article-view', async (req, res) => {
  const { articleId, userId } = req.body || {};
  if (!articleId) return res.status(400).json({ error: 'validation_error', message: 'articleId é obrigatório.' });
  try {
    await pool.query('INSERT INTO article_views (article_id, user_id) VALUES ($1, $2)', [articleId, userId || null]);
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error('Failed to log article view', { error: err.message });
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

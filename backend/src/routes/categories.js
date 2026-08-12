import { Router } from 'express';
import { pool } from '../db/pool.js';

export const categoriesRouter = Router();

// GET /api/categories — every category, with a real COUNT of its approved articles
// (replaces the hardcoded "42 artigos" style numbers in the current HTML).
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.slug, c.description,
             count(a.id) FILTER (WHERE a.status = 'approved') AS article_count
      FROM categories c
      LEFT JOIN articles a ON a.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json(rows.map((r) => ({ ...r, article_count: Number(r.article_count) })));
  } catch (err) { next(err); }
});

// GET /api/categories/:slug/articles — approved articles in one category, card shape.
categoriesRouter.get('/:slug/articles', async (req, res, next) => {
  try {
    const { rows: cat } = await pool.query('SELECT id, name, slug FROM categories WHERE slug = $1', [req.params.slug]);
    if (!cat.length) return res.status(404).json({ error: 'not_found', message: 'Categoria não encontrada.' });

    const { rows } = await pool.query(
      `SELECT id, slug, title, title_pt, authors, published_at, reading_time_minutes, excerpt
       FROM articles WHERE category_id = $1 AND status = 'approved'
       ORDER BY published_at DESC NULLS LAST`,
      [cat[0].id],
    );
    res.json({ category: cat[0], articles: rows });
  } catch (err) { next(err); }
});

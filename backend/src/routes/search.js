import { Router } from 'express';
import { pool } from '../db/pool.js';

export const searchRouter = Router();

// GET /api/search?q=hipertrofia
// Full-text search over title/title_pt/summary_pt/abstract (search_vector,
// built in the schema), unioned with a match on tag or category name so a
// query like "biomecânica" finds articles tagged or categorized that way
// even if the word never appears in the prose itself.
searchRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ query: q, total: 0, articles: [] });

    const { rows } = await pool.query(
      `SELECT DISTINCT a.id, a.slug, a.title, a.title_pt, a.authors, a.published_at,
              a.reading_time_minutes, a.excerpt,
              c.name AS category_name, c.slug AS category_slug,
              ts_rank(a.search_vector, websearch_to_tsquery('portuguese', $1)) AS rank
       FROM articles a
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN article_tags at ON at.article_id = a.id
       LEFT JOIN tags t ON t.id = at.tag_id
       WHERE a.status = 'approved' AND (
         a.search_vector @@ websearch_to_tsquery('portuguese', $1)
         OR c.name ILIKE '%' || $1 || '%'
         OR t.name ILIKE '%' || $1 || '%'
       )
       ORDER BY rank DESC NULLS LAST, a.published_at DESC NULLS LAST
       LIMIT 50`,
      [q],
    );
    res.json({ query: q, total: rows.length, articles: rows });
  } catch (err) { next(err); }
});
